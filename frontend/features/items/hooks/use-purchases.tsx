import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFocusEffect } from "expo-router";
import { Alert } from "react-native";
import {
  addItem as insertItem,
  trackUnsavedItem,
  deleteItems,
  moveItems,
  reorderItems,
  fetchHomeItems,
  markItemBought,
  markItemsBought,
  setItemNotFound,
  setItemsCategory,
  setItemsLater,
  clearItemsLater,
  setItemsUnit,
  setItemsUrgent,
  undoItemBought,
  updateItemCost,
  createTripReceipt,
  moveItemToReceipt,
  renameTripReceipt,
  updateItemDetails,
  uploadItemImage,
  removeItemImage,
  type BoughtCostEntry,
  type PickedPhoto,
  type NewItemInput,
  type UpdateItemInput,
} from "@/features/items/api/items";
import { translate } from "@/constants/i18n";
import { createWakeRetry } from "@/lib/wake-retry";
import {
  emitListChanged,
  onListChanged,
} from "@/features/items/utils/list-sync";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { maybeAskForPush } from "@/features/notifications/api/push";
import { readCachedItems, writeCachedItems } from "@/features/offline/profile-cache";
import type {
  Purchase,
  PurchaseCategory,
  PurchaseStatus,
} from "@/features/items/types/purchase";
import { normalizeName } from "@/features/items/utils/insights";
import { latestInvoiceThisMonth } from "@/features/items/utils/trips";

type AddItemValues = Omit<NewItemInput, "homeId" | "userId"> & {
  /** Uploaded right after the item is created; the row shows it meanwhile. */
  photo?: PickedPhoto | null;
};

type UsePurchasesResult = {
  purchases: Purchase[];
  /** What is on the lists now (parked items are in `later`). */
  needed: Purchase[];
  /** Still wanted, but parked on the Later shelf. */
  later: Purchase[];
  bought: Purchase[];
  getById: (id: string) => Purchase | undefined;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /**
   * `restored`: nothing new was added, because that name was waiting on the
   * list's Later shelf and came back instead.
   */
  addItem: (values: AddItemValues) => Promise<{ error: string | null; restored?: boolean }>;
  /** Attach/replace (photo) or remove (null) an item's photo. */
  setItemPhoto: (
    id: string,
    photo: PickedPhoto | null,
  ) => Promise<{ error: string | null }>;
  updateItem: (
    id: string,
    values: UpdateItemInput,
  ) => Promise<{ error: string | null }>;
  updateCost: (
    id: string,
    cost: number | null,
  ) => Promise<{ error: string | null }>;
  updateCosts: (
    entries: { id: string; cost: number | null }[],
  ) => Promise<{ error: string | null }>;
  /** Trip-total mode: one amount for the trip's items (an "invoice"). */
  saveTripTotal: (input: {
    total: number;
    itemIds: string[];
    listId?: string | null;
  }) => Promise<{ error: string | null; receiptId: string | null }>;
  /** Name a trip's invoice; a trip without one gets an invoice (no total yet). */
  renameTrip: (
    trip: { receiptId: string | null; itemIds: string[]; listId?: string | null },
    name: string,
  ) => Promise<{ error: string | null; receiptId: string | null }>;
  /** Move a bought item to another trip of the same month. */
  moveToTrip: (
    itemId: string,
    trip: { receiptId: string | null; itemIds: string[]; listId?: string | null },
  ) => Promise<{ error: string | null; receiptId: string | null }>;
  /**
   * takenBy: someone else bought it first (shopping together); their name.
   * The item is theirs, so it is not part of this person's trip.
   */
  markBought: (
    id: string,
    cost?: number | null,
    options?: BuyOptions,
  ) => Promise<{ error: string | null; takenBy?: string | null }>;
  undoBought: (id: string, options?: { onlyMine?: boolean }) => Promise<{ error: string | null }>;
  /** "Couldn't find it" in this shop; false puts it back on the list. */
  setNotFound: (id: string, notFound: boolean) => Promise<{ error: string | null }>;
  markManyBought: (
    entries: BoughtCostEntry[] | string[],
    options?: BuyOptions,
  ) => Promise<{ error: string | null }>;
  deleteMany: (ids: string[]) => Promise<{ error: string | null }>;
  moveMany: (
    ids: string[],
    listId: string,
  ) => Promise<{ error: string | null }>;
  setManyUrgent: (
    ids: string[],
    urgent: boolean,
  ) => Promise<{ error: string | null }>;
  setManyCategory: (
    ids: string[],
    category: PurchaseCategory,
  ) => Promise<{ error: string | null }>;
  /** unit "" clears it (plain pieces). */
  setManyUnit: (ids: string[], unit: string) => Promise<{ error: string | null }>;
  reorderNeeded: (ids: string[]) => Promise<{ error: string | null }>;
  /**
   * Park items on the Later shelf. `until` is when they return by themselves;
   * null keeps them there until someone brings them back.
   */
  setManyLater: (ids: string[], until: Date | null) => Promise<{ error: string | null }>;
  /** Bring parked items back to the list now. */
  bringBackMany: (ids: string[]) => Promise<{ error: string | null }>;
};

/**
 * joinInvoice: bought from the list (not during a trip). In trip-total mode the
 * item joins this month's latest invoice instead of floating on its own.
 */
type BuyOptions = { joinInvoice?: boolean };

const PurchasesContext = createContext<UsePurchasesResult | null>(null);

function toEntries(entries: BoughtCostEntry[] | string[]): BoughtCostEntry[] {
  if (entries.length === 0) return [];
  if (typeof entries[0] === "string") {
    return (entries as string[]).map((id) => ({ id, cost: null }));
  }
  return entries as BoughtCostEntry[];
}

export function PurchasesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { household, isLoading: isHomeLoading } = useHousehold();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);
  const wantedRef = useRef(0);
  const revision = useRef(0);
  const pendingWrites = useRef(0);
  const refreshAfterWrites = useRef(false);
  /** The last server answer put on screen, to recognise an identical one. */
  const lastApplied = useRef<{ homeId: string; revision: number; payload: string } | null>(null);
  const refreshRef = useRef<() => unknown>(() => undefined);
  const [wakeRetry] = useState(createWakeRetry);
  const homeId = household?.id ?? null;
  const homeIdRef = useRef(homeId);
  const purchasesRef = useRef(purchases);
  const [trackedHomeId, setTrackedHomeId] = useState(homeId);

  useEffect(() => {
    homeIdRef.current = homeId;
  }, [homeId]);

  useEffect(() => {
    purchasesRef.current = purchases;
  }, [purchases]);

  if (homeId !== trackedHomeId) {
    setTrackedHomeId(homeId);
    setError(null);
    if (!homeId) {
      setPurchases([]);
      setIsLoading(false);
    } else {
      const cached = readCachedItems(homeId);
      setPurchases(cached ?? []);
      setIsLoading(cached === null);
    }
  }

  const rememberItems = useCallback((items: Purchase[]) => {
    const activeHome = homeIdRef.current;
    if (!activeHome) return;
    // A photo still uploading only exists on this phone for now.
    writeCachedItems(
      activeHome,
      items.map((item) => {
        if (!item.localImageUri && !item.photoUploading) return item;
        const { localImageUri: _local, photoUploading: _busy, ...rest } = item;
        return rest;
      }),
    );
  }, []);

  /** Changes rows on screen and in the offline copy, from the same new list. */
  const applyAndRemember = useCallback(
    (change: (item: Purchase) => Purchase) => {
      setPurchases((current) => current.map(change));
      // The ref still holds the list from before this update.
      rememberItems(purchasesRef.current.map(change));
    },
    [rememberItems],
  );

  const refresh = useCallback(() => {
    wantedRef.current += 1;
    if (inflightRef.current) return inflightRef.current;

    const slot: { current: Promise<void> | null } = { current: null };
    const run = (async () => {
      // Callers in the same turn share this fetch. A later call still runs again.
      await Promise.resolve();
      try {
        while (true) {
          const ticket = wantedRef.current;
          const seen = revision.current;
          const activeHome = homeIdRef.current ?? homeId;
          if (!activeHome) {
            if (wantedRef.current !== ticket) continue;
            setPurchases([]);
            setError(null);
            setIsLoading(false);
          } else {
            const { items, error: fetchError, offline } =
              await fetchHomeItems(activeHome);
            if (homeIdRef.current !== activeHome) {
              // Signed out or left the home meanwhile: nothing left to load.
              if (!homeIdRef.current) break;
              continue;
            }
            if (pendingWrites.current > 0) {
              // A write is still on its way; its result must not be overwritten.
              // Run again once it lands, so a failed write is still rolled back.
              refreshAfterWrites.current = true;
              setIsLoading(false);
              break;
            }
            if (revision.current !== seen || wantedRef.current !== ticket)
              continue;
            // Showing the saved copy: keep asking until the server has woken.
            if (offline) wakeRetry.stale();
            else wakeRetry.fresh();
            if (fetchError) {
              // Keep what is on screen: one failed request (a busy server, a
              // dropped connection) must not look like an empty list.
              setError(fetchError);
            } else {
              // The trip screen asks every few seconds. When the server's
              // answer is the one already on screen (and nothing changed here
              // since), skip the re-render and the write to the phone's cache.
              const payload = JSON.stringify(items);
              const last = lastApplied.current;
              const unchanged =
                last !== null &&
                last.homeId === activeHome &&
                last.revision === revision.current &&
                last.payload === payload;
              if (!unchanged) {
                setPurchases((current) => keepLocalPhotos(items, current));
                writeCachedItems(activeHome, items);
                lastApplied.current = { homeId: activeHome, revision: revision.current, payload };
              }
              setError(null);
            }
            setIsLoading(false);
          }
          if (wantedRef.current !== ticket || homeIdRef.current !== activeHome)
            continue;
          break;
        }
      } finally {
        if (inflightRef.current === slot.current) inflightRef.current = null;
      }
    })();

    slot.current = run;
    inflightRef.current = run;
    return run;
  }, [homeId]);

  useEffect(() => onListChanged(() => void refresh()), [refresh]);

  useEffect(() => {
    refreshRef.current = refresh;
    wakeRetry.setRun(refresh);
  }, [refresh, wakeRetry]);
  // Another home, signed out, or the provider is gone: nothing to ask again for.
  useEffect(() => () => wakeRetry.cancel(), [homeId, wakeRetry]);

  const noteLocalChange = useCallback(() => {
    revision.current += 1;
    pendingWrites.current += 1;
    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      // A fetch that started before this write finished may predate it.
      revision.current += 1;
      pendingWrites.current = Math.max(0, pendingWrites.current - 1);
      if (pendingWrites.current === 0 && refreshAfterWrites.current) {
        refreshAfterWrites.current = false;
        void refresh();
      }
    };
  }, [refresh]);

  const setItemPhoto = useCallback(
    async (id: string, photo: PickedPhoto | null) => {
      if (!user) return { error: translate("errorNeedLogin") };
      const endLocalChange = noteLocalChange();
      const previous = purchasesRef.current.find((item) => item.id === id);
      setPurchases((current) =>
        current.map((item) =>
          item.id === id
            ? photo
              ? { ...item, localImageUri: photo.uri, photoUploading: true }
              : { ...item, imageId: null, localImageUri: undefined }
            : item,
        ),
      );
      let result: { item: Purchase | null; error: string | null };
      try {
        result = photo ? await uploadItemImage(id, photo) : await removeItemImage(id);
      } finally {
        endLocalChange();
      }
      if (result.error || !result.item) {
        setPurchases((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  imageId: previous?.imageId ?? null,
                  localImageUri: undefined,
                  photoUploading: false,
                }
              : item,
          ),
        );
        return { error: result.error ?? translate("errorGeneric") };
      }
      const imageId = result.item.imageId ?? null;
      // Keep showing the local file while it is the same photo the server has
      // (see keepLocalPhotos), so the thumbnail doesn't blink after upload.
      const withId = (item: Purchase) =>
        item.id === id ? { ...item, imageId, photoUploading: false } : item;
      setPurchases((current) => current.map(withId));
      rememberItems(purchasesRef.current.map(withId));
      emitListChanged();
      return { error: null };
    },
    [noteLocalChange, rememberItems, user],
  );

  const addItem = useCallback(
    async (values: AddItemValues) => {
      if (!household || !user) {
        return {
          error: translate(!user ? "errorNeedLogin" : "errorNeedHome"),
        };
      }

      // Already wanted, just parked for later: adding it again (typed, picked
      // from a suggestion, a pin's "add now") brings that one back instead of
      // making a twin that would be joined by the parked one on its day.
      const wantedName = normalizeName(values.name);
      const parked = purchasesRef.current.find(
        (item) =>
          item.status === "needed" &&
          Boolean(item.laterAt) &&
          (!values.listId || item.listId === values.listId) &&
          normalizeName(item.name) === wantedName,
      );
      if (parked) {
        const endParkedChange = noteLocalChange();
        const back = (item: Purchase) =>
          item.id === parked.id ? { ...item, laterAt: undefined, laterUntil: undefined } : item;
        setPurchases((current) => current.map(back));
        let restored: { error: string | null };
        try {
          restored = await clearItemsLater([parked.id]);
        } finally {
          endParkedChange();
        }
        if (restored.error) {
          await refresh();
          return { error: restored.error };
        }
        rememberItems(purchasesRef.current.map(back));
        emitListChanged();
        return { error: null, restored: true };
      }

      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const optimistic: Purchase = {
        id: tempId,
        name: values.name.trim(),
        quantity: values.quantity,
        unit: values.unit?.trim() || undefined,
        category: values.category,
        notes: values.notes?.trim() || undefined,
        status: "needed",
        urgent: values.urgent === true,
        cost: null,
        localImageUri: values.photo?.uri,
        photoUploading: Boolean(values.photo),
        listId: values.listId,
        addedByName: user.name,
        createdAt: new Date().toISOString(),
      };

      const endLocalChange = noteLocalChange();
      setPurchases((current) => placeNeededLocally(current, optimistic));

      const { photo, ...fields } = values;
      let result: { item: Purchase | null; error: string | null };
      try {
        const saving = insertItem({
          ...fields,
          homeId: household.id,
          userId: user.id,
        });
        // Anything done to the row before it is saved waits for its real id.
        trackUnsavedItem(
          tempId,
          saving.then((saved) => saved.item?.id ?? null),
        );
        result = await saving;
      } finally {
        endLocalChange();
      }

      if (result.error) {
        setPurchases((current) => current.filter((item) => item.id !== tempId));
        await refresh();
        return { error: result.error };
      }

      if (result.item) {
        const created: Purchase = photo
          ? { ...result.item, localImageUri: photo.uri, photoUploading: true }
          : result.item;
        setPurchases((current) =>
          current.map((item) => (item.id === tempId ? created : item)),
        );
        if (photo) {
          // The sheet closes now; the row shows the local photo while it uploads.
          void setItemPhoto(created.id, photo).then((upload) => {
            if (upload.error) Alert.alert(translate("itemPhoto"), upload.error);
          });
        }
        rememberItems(
          purchasesRef.current.map((item) =>
            item.id === tempId ? created : item,
          ),
        );
      } else {
        emitListChanged();
      }
      // A shared list is when alerts start to matter: ask once, softly.
      if (household.members.length > 1) void maybeAskForPush();
      return { error: null };
    },
    [household, noteLocalChange, refresh, rememberItems, setItemPhoto, user],
  );

  const invoiceFor = useCallback(
    (itemId: string | undefined, options?: BuyOptions) => {
      if (!itemId || !options?.joinInvoice) return null;
      if (household?.costsEnabled !== true || household.tripCostMode !== "total") return null;
      const item = purchasesRef.current.find((entry) => entry.id === itemId);
      if (!item) return null;
      // Same list only, so an invoice stays one shop's trip for that list.
      return latestInvoiceThisMonth(purchasesRef.current, new Date(), item.listId ?? null);
    },
    [household],
  );

  const markBought = useCallback(
    async (id: string, cost?: number | null, options?: BuyOptions) => {
      if (!user) return { error: translate("errorNeedLogin") };
      const receiptId = invoiceFor(id, options);
      const endLocalChange = noteLocalChange();
      const boughtAt = new Date().toISOString();
      setPurchases((current) =>
        current.map((item) =>
          item.id === id && item.status === "needed"
            ? {
                ...item,
                status: "bought",
                urgent: false,
                boughtAt,
                cost: cost ?? null,
              }
            : item,
        ),
      );
      let result: Awaited<ReturnType<typeof markItemBought>>;
      try {
        result = await markItemBought(id, cost, receiptId);
      } finally {
        endLocalChange();
      }
      if (result.error) {
        await refresh();
        return { error: result.error };
      }
      const server = result.item;
      // Someone else got there first: show their purchase (and price), not ours.
      const takenBy =
        server && server.boughtById && server.boughtById !== user.id
          ? (server.boughtByName ?? translate("partner"))
          : null;
      if (takenBy && server) {
        setPurchases((current) => current.map((item) => (item.id === id ? server : item)));
      }
      // Joining an invoice changes its total and name on the server: reload.
      if (receiptId || takenBy) await refresh();
      else {
        applyAndRemember((item) =>
          item.id === id && server?.boughtById
            ? { ...item, boughtById: server.boughtById }
            : item,
        );
      }
      return { error: null, takenBy };
    },
    [invoiceFor, noteLocalChange, refresh, rememberItems, user],
  );

  const setNotFound = useCallback(
    async (id: string, notFound: boolean) => {
      if (!user) return { error: translate("errorNeedLogin") };
      const endLocalChange = noteLocalChange();
      const notFoundAt = new Date().toISOString();
      setPurchases((current) =>
        current.map((item) =>
          item.id === id && item.status === "needed"
            ? notFound
              ? { ...item, notFoundAt, notFoundById: user.id, notFoundByName: user.name ?? undefined }
              : { ...item, notFoundAt: undefined, notFoundById: undefined, notFoundByName: undefined }
            : item,
        ),
      );
      let result: Awaited<ReturnType<typeof setItemNotFound>>;
      try {
        result = await setItemNotFound(id, notFound);
      } finally {
        endLocalChange();
      }
      if (result.error) {
        await refresh();
        return { error: result.error };
      }
      const server = result.item;
      applyAndRemember((item) => (server && item.id === id ? server : item));
      emitListChanged();
      return { error: null };
    },
    [noteLocalChange, refresh, rememberItems, user],
  );

  const updateItem = useCallback(
    async (id: string, values: UpdateItemInput) => {
      if (!user) return { error: translate("errorNeedLogin") };
      const endLocalChange = noteLocalChange();
      const previous = purchasesRef.current.find((item) => item.id === id);
      const becameUrgent =
        !!previous &&
        !previous.urgent &&
        values.urgent === true &&
        previous.status === "needed";

      setPurchases((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                name: values.name,
                quantity: values.quantity,
                category: values.category,
                urgent: values.urgent === true,
                notes: values.notes ?? item.notes,
                unit:
                  typeof values.unit === "string"
                    ? values.unit.trim() || undefined
                    : item.unit,
              }
            : item,
        ),
      );

      let result: { error: string | null };
      try {
        result = await updateItemDetails(id, values);
      } finally {
        endLocalChange();
      }
      if (result.error) await refresh();
      else {
        rememberItems(purchasesRef.current);
        if (becameUrgent) emitListChanged();
      }
      return result;
    },
    [noteLocalChange, refresh, rememberItems, user],
  );

  const updateCost = useCallback(
    async (id: string, cost: number | null) => {
      if (!user) return { error: translate("errorNeedLogin") };
      const onInvoice = Boolean(purchasesRef.current.find((item) => item.id === id)?.receiptId);
      const endLocalChange = noteLocalChange();
      setPurchases((current) =>
        current.map((item) => (item.id === id ? { ...item, cost } : item)),
      );
      let result: { error: string | null };
      try {
        result = await updateItemCost(id, cost);
      } finally {
        endLocalChange();
      }
      // Its price is part of the invoice total, which the server just changed.
      if (result.error || onInvoice) await refresh();
      else rememberItems(purchasesRef.current);
      return result;
    },
    [noteLocalChange, refresh, rememberItems, user],
  );

  const saveTripTotal = useCallback(
    async (input: { total: number; itemIds: string[]; listId?: string | null }) => {
      const currentHomeId = homeIdRef.current;
      if (!user || !currentHomeId) return { error: translate("errorNeedLogin"), receiptId: null };
      const endLocalChange = noteLocalChange();
      let result: Awaited<ReturnType<typeof createTripReceipt>>;
      try {
        result = await createTripReceipt(currentHomeId, input);
      } finally {
        endLocalChange();
      }
      if (result.error || !result.receipt) {
        return { error: result.error ?? translate("errorGeneric"), receiptId: null };
      }
      const receipt = result.receipt;
      const ids = new Set(input.itemIds);
      applyAndRemember((item) =>
        ids.has(item.id)
          ? { ...item, receiptId: receipt.id, receiptTotal: Number(receipt.total) }
          : item,
      );
      return { error: null, receiptId: receipt.id };
    },
    [noteLocalChange, rememberItems, user],
  );

  const ensureInvoice = useCallback(
    async (
      trip: { receiptId: string | null; itemIds: string[]; listId?: string | null },
      name?: string,
    ) => {
      const currentHomeId = homeIdRef.current;
      if (!currentHomeId) return { error: translate("errorNeedLogin"), receiptId: null };
      if (trip.receiptId) {
        if (name === undefined) return { error: null, receiptId: trip.receiptId };
        const renamed = await renameTripReceipt(trip.receiptId, name);
        return { error: renamed.error, receiptId: trip.receiptId };
      }
      const created = await createTripReceipt(currentHomeId, {
        total: null,
        itemIds: trip.itemIds,
        listId: trip.listId,
        name: name?.trim() || null,
      });
      return { error: created.error, receiptId: created.receipt?.id ?? null };
    },
    [],
  );

  const renameTrip = useCallback(
    async (
      trip: { receiptId: string | null; itemIds: string[]; listId?: string | null },
      name: string,
    ) => {
      if (!user) return { error: translate("errorNeedLogin"), receiptId: null };
      const endLocalChange = noteLocalChange();
      let result: { error: string | null; receiptId: string | null };
      try {
        result = await ensureInvoice(trip, name);
      } finally {
        endLocalChange();
      }
      await refresh();
      return result;
    },
    [ensureInvoice, noteLocalChange, refresh, user],
  );

  const moveToTrip = useCallback(
    async (
      itemId: string,
      trip: { receiptId: string | null; itemIds: string[]; listId?: string | null },
    ) => {
      if (!user) return { error: translate("errorNeedLogin"), receiptId: null };
      const endLocalChange = noteLocalChange();
      let result: { error: string | null; receiptId: string | null };
      try {
        // A trip without an invoice gets one first, so the item has somewhere to go.
        result = await ensureInvoice(trip);
        if (!result.error && result.receiptId) {
          const moved = await moveItemToReceipt(itemId, result.receiptId);
          result = { error: moved.error, receiptId: result.receiptId };
        }
      } finally {
        endLocalChange();
      }
      await refresh();
      return result;
    },
    [ensureInvoice, noteLocalChange, refresh, user],
  );

  const updateCosts = useCallback(
    async (entries: { id: string; cost: number | null }[]) => {
      if (!user) return { error: translate("errorNeedLogin") };
      const endLocalChange = noteLocalChange();
      const costs = new Map(entries.map((entry) => [entry.id, entry.cost]));
      setPurchases((current) =>
        current.map((item) =>
          costs.has(item.id) ? { ...item, cost: costs.get(item.id) } : item,
        ),
      );
      let failed: { error: string | null } | undefined;
      try {
        const results = await Promise.all(
          entries.map((entry) => updateItemCost(entry.id, entry.cost)),
        );
        failed = results.find((result) => result.error);
      } finally {
        endLocalChange();
      }
      if (failed?.error) {
        await refresh();
        return { error: failed.error };
      }
      rememberItems(purchasesRef.current);
      return { error: null };
    },
    [noteLocalChange, refresh, rememberItems, user],
  );

  const undoBought = useCallback(
    async (id: string, options?: { onlyMine?: boolean }) => {
      if (!user) return { error: translate("errorNeedLogin") };
      const onInvoice = Boolean(purchasesRef.current.find((item) => item.id === id)?.receiptId);
      const endLocalChange = noteLocalChange();
      setPurchases((current) =>
        current.map((item) =>
          item.id === id && item.status === "bought"
            ? {
                ...item,
                status: "needed",
                boughtAt: undefined,
                boughtById: undefined,
                boughtByName: undefined,
                cost: null,
                receiptId: null,
                receiptTotal: null,
                receiptName: null,
              }
            : item,
        ),
      );
      let result: { error: string | null };
      try {
        result = await undoItemBought(id, options);
      } finally {
        endLocalChange();
      }
      if (result.error) await refresh();
      else {
        if (onInvoice) await refresh();
        else rememberItems(purchasesRef.current);
        emitListChanged();
      }
      return result;
    },
    [noteLocalChange, refresh, rememberItems, user],
  );

  const markManyBought = useCallback(
    async (entries: BoughtCostEntry[] | string[], options?: BuyOptions) => {
      if (!user) return { error: translate("errorNeedLogin") };
      const prepared = toEntries(entries);
      const receiptId = invoiceFor(prepared[0]?.id, options);
      const endLocalChange = noteLocalChange();
      const costs = new Map(
        prepared.map((entry) => [entry.id, entry.cost ?? null]),
      );
      const boughtAt = new Date().toISOString();
      setPurchases((current) =>
        current.map((item) =>
          costs.has(item.id) && item.status === "needed"
            ? {
                ...item,
                status: "bought",
                urgent: false,
                boughtAt,
                cost: costs.get(item.id) ?? null,
              }
            : item,
        ),
      );
      let result: { error: string | null };
      try {
        result = await markItemsBought(prepared, receiptId);
      } finally {
        endLocalChange();
      }
      if (result.error || receiptId) await refresh();
      else rememberItems(purchasesRef.current);
      return result;
    },
    [invoiceFor, noteLocalChange, refresh, rememberItems, user],
  );

  const deleteMany = useCallback(
    async (ids: string[]) => {
      if (!user) return { error: translate("errorNeedLogin") };
      const endLocalChange = noteLocalChange();
      const removing = new Set(ids);
      setPurchases((current) =>
        current.filter((item) => !removing.has(item.id)),
      );
      let result: { error: string | null };
      try {
        result = await deleteItems(ids);
      } finally {
        endLocalChange();
      }
      if (result.error) await refresh();
      else rememberItems(purchasesRef.current);
      return result;
    },
    [noteLocalChange, refresh, rememberItems, user],
  );

  const moveMany = useCallback(
    async (ids: string[], listId: string) => {
      if (!user) return { error: translate("errorNeedLogin") };
      const endLocalChange = noteLocalChange();
      const moving = new Set(ids);
      setPurchases((current) =>
        current.map((item) =>
          moving.has(item.id) ? { ...item, listId } : item,
        ),
      );
      let result: { error: string | null };
      try {
        result = await moveItems(ids, listId);
      } finally {
        endLocalChange();
      }
      if (result.error) await refresh();
      else {
        rememberItems(purchasesRef.current);
        emitListChanged();
      }
      return result;
    },
    [noteLocalChange, refresh, rememberItems, user],
  );

  const setManyUrgent = useCallback(
    async (ids: string[], urgent: boolean) => {
      if (!user) return { error: translate("errorNeedLogin") };
      const endLocalChange = noteLocalChange();
      const selected = new Set(ids);
      setPurchases((current) =>
        current.map((item) =>
          selected.has(item.id) && item.status === "needed"
            ? { ...item, urgent }
            : item,
        ),
      );
      let result: { error: string | null };
      try {
        result = await setItemsUrgent(ids, urgent);
      } finally {
        endLocalChange();
      }
      if (result.error) await refresh();
      else {
        rememberItems(purchasesRef.current);
        emitListChanged();
      }
      return result;
    },
    [noteLocalChange, refresh, rememberItems, user],
  );

  /** Change one field on many needed items: shown at once, undone by a refresh if the save fails. */
  const patchManyNeeded = useCallback(
    async (
      ids: string[],
      patch: Partial<Purchase>,
      save: () => Promise<{ error: string | null }>,
    ) => {
      if (!user) return { error: translate("errorNeedLogin") };
      const endLocalChange = noteLocalChange();
      const selected = new Set(ids);
      setPurchases((current) =>
        current.map((item) =>
          selected.has(item.id) && item.status === "needed"
            ? { ...item, ...patch }
            : item,
        ),
      );
      let result: { error: string | null };
      try {
        result = await save();
      } finally {
        endLocalChange();
      }
      if (result.error) await refresh();
      else {
        rememberItems(purchasesRef.current);
        emitListChanged();
      }
      return result;
    },
    [noteLocalChange, refresh, rememberItems, user],
  );

  const setManyCategory = useCallback(
    (ids: string[], category: PurchaseCategory) =>
      patchManyNeeded(ids, { category }, () => setItemsCategory(ids, category)),
    [patchManyNeeded],
  );

  const setManyUnit = useCallback(
    (ids: string[], unit: string) => {
      const value = unit.trim();
      return patchManyNeeded(ids, { unit: value || undefined }, () =>
        setItemsUnit(ids, value),
      );
    },
    [patchManyNeeded],
  );

  const setManyLater = useCallback(
    (ids: string[], until: Date | null) => {
      const laterUntil = until ? until.toISOString() : undefined;
      return patchManyNeeded(ids, { laterAt: new Date().toISOString(), laterUntil }, () =>
        setItemsLater(ids, laterUntil ?? null),
      );
    },
    [patchManyNeeded],
  );

  const bringBackMany = useCallback(
    (ids: string[]) =>
      patchManyNeeded(ids, { laterAt: undefined, laterUntil: undefined }, () =>
        clearItemsLater(ids),
      ),
    [patchManyNeeded],
  );

  const reorderNeeded = useCallback(
    async (ids: string[]) => {
      if (!user) return { error: translate("errorNeedLogin") };
      const endLocalChange = noteLocalChange();

      setPurchases((current) => {
        const neededRows = current.filter((item) => item.status === "needed");
        const boughtRows = current.filter((item) => item.status === "bought");
        const byId = new Map(neededRows.map((item) => [item.id, item]));
        const moving = new Set(ids);
        const queue = ids.filter((id) => byId.has(id));
        const nextNeeded = neededRows.map((item) => {
          if (!moving.has(item.id)) return item;
          const id = queue.shift();
          return (id && byId.get(id)) || item;
        });
        return [...nextNeeded, ...boughtRows];
      });

      let result: { error: string | null };
      try {
        result = await reorderItems(ids);
      } finally {
        endLocalChange();
      }
      if (result.error) await refresh();
      else rememberItems(purchasesRef.current);
      return result;
    },
    [noteLocalChange, refresh, rememberItems, user],
  );

  const needed = useMemo(
    () => purchases.filter((item) => item.status === "needed" && !item.laterAt),
    [purchases],
  );
  const later = useMemo(
    () => purchases.filter((item) => item.status === "needed" && Boolean(item.laterAt)),
    [purchases],
  );
  const bought = useMemo(
    () =>
      purchases
        .filter((item) => item.status === "bought")
        .sort((a, b) => (b.boughtAt ?? "").localeCompare(a.boughtAt ?? "")),
    [purchases],
  );

  const getById = useCallback(
    (id: string) => purchases.find((item) => item.id === id),
    [purchases],
  );

  const value = useMemo<UsePurchasesResult>(
    () => ({
      purchases,
      needed,
      later,
      bought,
      getById,
      isLoading: isHomeLoading || isLoading,
      error,
      refresh,
      addItem,
      setItemPhoto,
      updateItem,
      updateCost,
      updateCosts,
      saveTripTotal,
      renameTrip,
      moveToTrip,
      markBought,
      undoBought,
      setNotFound,
      markManyBought,
      deleteMany,
      moveMany,
      setManyUrgent,
      setManyCategory,
      setManyUnit,
      reorderNeeded,
      setManyLater,
      bringBackMany,
    }),
    [
      purchases,
      needed,
      later,
      bought,
      getById,
      isHomeLoading,
      isLoading,
      error,
      refresh,
      addItem,
      setItemPhoto,
      updateItem,
      updateCost,
      updateCosts,
      saveTripTotal,
      renameTrip,
      moveToTrip,
      markBought,
      undoBought,
      setNotFound,
      markManyBought,
      deleteMany,
      moveMany,
      setManyUrgent,
      setManyCategory,
      setManyUnit,
      reorderNeeded,
      setManyLater,
      bringBackMany,
    ],
  );

  return (
    <PurchasesContext.Provider value={value}>
      {children}
    </PurchasesContext.Provider>
  );
}

/** The same data without refreshing on focus; for sheets and small helpers. */
export function usePurchasesData(): UsePurchasesResult {
  const value = useContext(PurchasesContext);
  if (!value) {
    throw new Error("usePurchasesData must be used within PurchasesProvider");
  }
  return value;
}

export function usePurchases(): UsePurchasesResult {
  const value = useContext(PurchasesContext);
  const { isLoading: isHomeLoading } = useHousehold();
  const refresh = value?.refresh;

  useFocusEffect(
    useCallback(() => {
      if (!refresh || isHomeLoading) return;
      void refresh();
    }, [isHomeLoading, refresh]),
  );

  if (!value) {
    throw new Error("usePurchases must be used within PurchasesProvider");
  }

  return value;
}

/**
 * A photo picked on this phone stays on screen from the local file while the
 * server still has that same photo; it avoids a blank flash after upload.
 */
function keepLocalPhotos(next: Purchase[], current: Purchase[]): Purchase[] {
  const local = new Map(
    current
      .filter((item) => item.localImageUri && item.imageId && !item.photoUploading)
      .map((item) => [item.id, item]),
  );
  if (local.size === 0) return next;
  return next.map((item) => {
    const mine = local.get(item.id);
    return mine && mine.imageId === item.imageId
      ? { ...item, localImageUri: mine.localImageUri }
      : item;
  });
}

/** Mirror backend placeNeeded: urgent at top, else after the urgent block. */
function placeNeededLocally(purchases: Purchase[], item: Purchase): Purchase[] {
  const needed = purchases.filter((row) => row.status === "needed");
  const bought = purchases.filter((row) => row.status === "bought");
  if (item.urgent) return [item, ...needed, ...bought];
  // Below the urgent rows of its own list (the server orders each list by itself).
  const sameList = (row: Purchase) => !item.listId || row.listId === item.listId;
  let index = needed.findIndex((row) => sameList(row) && !row.urgent);
  if (index === -1) {
    const lastOfList = needed.findLastIndex(sameList);
    index = lastOfList === -1 ? needed.length : lastOfList + 1;
  }
  const nextNeeded = [...needed.slice(0, index), item, ...needed.slice(index)];
  return [...nextNeeded, ...bought];
}
