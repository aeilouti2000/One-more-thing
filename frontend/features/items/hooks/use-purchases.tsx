import { loadHomeItems, requireFullSync } from "@/features/sync/engine";
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
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import {
  addItem as insertItem,
  cachedItems,
  deleteItems,
  moveItems,
  putItem,
  reorderItems,
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
import { localizeMessage, translate } from "@/constants/i18n";
import { showToast } from "@/lib/toast";
import {
  emitListChanged,
  onListChanged,
} from "@/features/items/utils/list-sync";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { maybeAskForPush } from "@/features/notifications/api/push";
import { newId } from "@/features/offline/ids";
import { qk, queryClient } from "@/features/offline/query-client";
import type {
  Purchase,
  PurchaseCategory,
} from "@/features/items/types/purchase";
import { normalizeName } from "@/features/items/utils/insights";
import { changedDetails } from "@/features/items/utils/optimistic";
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

type DataKeys = "purchases" | "needed" | "later" | "bought" | "getById" | "isLoading" | "error";
type PurchasesData = Pick<UsePurchasesResult, DataKeys>;
type PurchaseActions = Omit<UsePurchasesResult, DataKeys>;

/**
 * Two contexts: the items change with every tick of a trip, the actions almost
 * never. A component that only acts (a sheet, a button) reads the actions and
 * does not redraw when an item changes.
 */
const PurchasesDataContext = createContext<PurchasesData | null>(null);
const PurchasesActionsContext = createContext<PurchaseActions | null>(null);

function toEntries(entries: BoughtCostEntry[] | string[]): BoughtCostEntry[] {
  if (entries.length === 0) return [];
  if (typeof entries[0] === "string") {
    return (entries as string[]).map((id) => ({ id, cost: null }));
  }
  return entries as BoughtCostEntry[];
}

const NO_ITEMS: Purchase[] = [];
type Result = { error: string | null };

/**
 * The home's items for every screen. The list itself lives in the TanStack
 * Query cache (saved on the phone); this provider reads it from there and
 * turns each action into a change that is shown at once and sent now or, with
 * no internet, when the connection returns (see features/offline/outbox).
 */
export function PurchasesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { household, isLoading: isHomeLoading } = useHousehold();
  const homeId = household?.id ?? null;
  const homeIdRef = useRef(homeId);
  const [error, setError] = useState<string | null>(null);
  /** The home whose first load has ended (with data or with an error). */
  const [loadedHome, setLoadedHome] = useState<string | null>(null);
  const [trackedHomeId, setTrackedHomeId] = useState(homeId);
  const inflight = useRef<{ homeId: string; run: Promise<void> } | null>(null);
  const again = useRef(false);

  useEffect(() => {
    homeIdRef.current = homeId;
  }, [homeId]);

  if (homeId !== trackedHomeId) {
    setTrackedHomeId(homeId);
    setError(null);
  }

  // Only a window onto the saved copy: loading is done by refresh() below,
  // which also keeps a change in progress from being overwritten.
  const { data } = useQuery<Purchase[]>(
    {
      queryKey: qk.items(homeId ?? "none"),
      queryFn: () => cachedItems(homeId ?? "none") ?? NO_ITEMS,
      enabled: false,
    },
    queryClient,
  );
  const purchases = homeId ? (data ?? NO_ITEMS) : NO_ITEMS;
  const isLoading = Boolean(homeId) && data === undefined && loadedHome !== homeId;

  /** The list as it is this instant (also right after a change, before a render). */
  const current = useCallback(() => {
    const activeHome = homeIdRef.current;
    return (activeHome ? cachedItems(activeHome) : undefined) ?? NO_ITEMS;
  }, []);

  const refresh = useCallback(() => {
    const activeHome = homeIdRef.current;
    if (!activeHome) return Promise.resolve();
    if (inflight.current?.homeId === activeHome) {
      // Callers share the load in progress; one more runs after it.
      again.current = true;
      return inflight.current.run;
    }
    const run: Promise<void> = (async () => {
      do {
        again.current = false;
        const result = await loadHomeItems(activeHome);
        // Signed out or switched home meanwhile: nothing to show for this one.
        if (homeIdRef.current !== activeHome) return;
        // Keep what is on screen: one failed request (a busy server, a dropped
        // connection) must not look like an empty list.
        setError(result.error);
        setLoadedHome(activeHome);
      } while (again.current);
    })().finally(() => {
      if (inflight.current?.run === run) inflight.current = null;
    });
    inflight.current = { homeId: activeHome, run };
    return run;
  }, []);

  // Another screen changed the list, a waiting change was sent, or the
  // connection came back: load the server's version.
  useEffect(() => onListChanged(() => void refresh()), [refresh]);

  /** After a refused change the screen goes back to what the server has. */
  const settle = useCallback(
    async (result: Result, changed = true): Promise<Result> => {
      if (result.error) {
        // What this phone shows was refused: only a full copy puts it right
        // ("what changed" would answer "nothing").
        requireFullSync();
        await refresh();
      } else if (changed) emitListChanged();
      return { error: result.error };
    },
    [refresh],
  );

  const setItemPhoto = useCallback(
    async (id: string, photo: PickedPhoto | null) => {
      if (!user) return { error: translate("errorNeedLogin") };
      const result = photo ? await uploadItemImage(id, photo) : await removeItemImage(id);
      if (result.error) return { error: result.error };
      emitListChanged();
      return { error: null };
    },
    [user],
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
      const parked = current().find(
        (item) =>
          item.status === "needed" &&
          Boolean(item.laterAt) &&
          (!values.listId || item.listId === values.listId) &&
          normalizeName(item.name) === wantedName,
      );
      if (parked) {
        const restored = await settle(await clearItemsLater([parked.id]));
        if (restored.error) return { error: restored.error };
        return { error: null, restored: true };
      }

      const { photo, ...fields } = values;
      const id = newId();
      const result = await insertItem({
        ...fields,
        id,
        homeId: household.id,
        userId: user.id,
        addedByName: user.name,
        // The row shows the picked photo while it uploads.
        localImageUri: photo?.uri,
      });
      if (result.error) {
        await refresh();
        return { error: result.error };
      }
      if (photo) {
        // The sheet closes now; the upload follows the item (also offline).
        void setItemPhoto(id, photo).then((upload) => {
          if (upload.error) showToast(localizeMessage(upload.error));
        });
      }
      // A shared list is when alerts start to matter: ask once, softly.
      if (household.members.length > 1) void maybeAskForPush();
      return { error: null };
    },
    [current, household, refresh, setItemPhoto, settle, user],
  );

  const invoiceFor = useCallback(
    (itemId: string | undefined, options?: BuyOptions) => {
      if (!itemId || !options?.joinInvoice) return null;
      if (household?.costsEnabled !== true || household.tripCostMode !== "total") return null;
      const items = current();
      const item = items.find((entry) => entry.id === itemId);
      if (!item) return null;
      // Same list only, so an invoice stays one shop's trip for that list.
      return latestInvoiceThisMonth(items, new Date(), item.listId ?? null);
    },
    [current, household],
  );

  const markBought = useCallback(
    async (id: string, cost?: number | null, options?: BuyOptions) => {
      if (!user) return { error: translate("errorNeedLogin") };
      const receiptId = invoiceFor(id, options);
      const result = await markItemBought(id, cost, receiptId);
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
      if (takenBy && server) putItem(server);
      // Joining an invoice changes its total and name on the server: reload.
      if (receiptId || takenBy) await refresh();
      return { error: null, takenBy };
    },
    [invoiceFor, refresh, user],
  );

  const setNotFound = useCallback(
    async (id: string, notFound: boolean) => {
      if (!user) return { error: translate("errorNeedLogin") };
      const result = await setItemNotFound(id, notFound);
      if (result.item) putItem(result.item);
      return settle(result);
    },
    [settle, user],
  );

  const updateItem = useCallback(
    async (id: string, values: UpdateItemInput) => {
      if (!user) return { error: translate("errorNeedLogin") };
      const previous = current().find((item) => item.id === id);
      const becameUrgent =
        !!previous &&
        !previous.urgent &&
        values.urgent === true &&
        previous.status === "needed";
      // Only what changed is sent, so a partner's edit of another field stays.
      const result = await updateItemDetails(id, changedDetails(previous, values));
      return settle(result, becameUrgent);
    },
    [current, settle, user],
  );

  const updateCost = useCallback(
    async (id: string, cost: number | null) => {
      if (!user) return { error: translate("errorNeedLogin") };
      const onInvoice = Boolean(current().find((item) => item.id === id)?.receiptId);
      const result = await updateItemCost(id, cost);
      // Its price is part of the invoice total, which the server just changed.
      if (result.error || onInvoice) await refresh();
      return { error: result.error };
    },
    [current, refresh, user],
  );

  const saveTripTotal = useCallback(
    async (input: { total: number; itemIds: string[]; listId?: string | null }) => {
      const currentHomeId = homeIdRef.current;
      if (!user || !currentHomeId) return { error: translate("errorNeedLogin"), receiptId: null };
      const result = await createTripReceipt(currentHomeId, input);
      if (result.error || !result.receipt) {
        await refresh();
        return { error: result.error ?? translate("errorGeneric"), receiptId: null };
      }
      return { error: null, receiptId: result.receipt.id };
    },
    [refresh, user],
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
      const result = await ensureInvoice(trip, name);
      await refresh();
      return result;
    },
    [ensureInvoice, refresh, user],
  );

  const moveToTrip = useCallback(
    async (
      itemId: string,
      trip: { receiptId: string | null; itemIds: string[]; listId?: string | null },
    ) => {
      if (!user) return { error: translate("errorNeedLogin"), receiptId: null };
      // A trip without an invoice gets one first, so the item has somewhere to go.
      let result = await ensureInvoice(trip);
      if (!result.error && result.receiptId) {
        const moved = await moveItemToReceipt(itemId, result.receiptId);
        result = { error: moved.error, receiptId: result.receiptId };
      }
      await refresh();
      return result;
    },
    [ensureInvoice, refresh, user],
  );

  const updateCosts = useCallback(
    async (entries: { id: string; cost: number | null }[]) => {
      if (!user) return { error: translate("errorNeedLogin") };
      const results = await Promise.all(
        entries.map((entry) => updateItemCost(entry.id, entry.cost)),
      );
      const failed = results.find((result) => result.error);
      if (failed?.error) {
        await refresh();
        return { error: failed.error };
      }
      return { error: null };
    },
    [refresh, user],
  );

  const undoBought = useCallback(
    async (id: string, options?: { onlyMine?: boolean }) => {
      if (!user) return { error: translate("errorNeedLogin") };
      const onInvoice = Boolean(current().find((item) => item.id === id)?.receiptId);
      const result = await undoItemBought(id, options);
      if (!result.error && onInvoice) await refresh();
      return settle(result);
    },
    [current, refresh, settle, user],
  );

  const markManyBought = useCallback(
    async (entries: BoughtCostEntry[] | string[], options?: BuyOptions) => {
      if (!user) return { error: translate("errorNeedLogin") };
      const prepared = toEntries(entries);
      const receiptId = invoiceFor(prepared[0]?.id, options);
      const result = await markItemsBought(prepared, receiptId);
      if (result.error || receiptId) await refresh();
      return { error: result.error };
    },
    [invoiceFor, refresh, user],
  );

  const deleteMany = useCallback(
    async (ids: string[]) => {
      if (!user) return { error: translate("errorNeedLogin") };
      return settle(await deleteItems(ids), false);
    },
    [settle, user],
  );

  const moveMany = useCallback(
    async (ids: string[], listId: string) => {
      if (!user) return { error: translate("errorNeedLogin") };
      return settle(await moveItems(ids, listId));
    },
    [settle, user],
  );

  const setManyUrgent = useCallback(
    async (ids: string[], urgent: boolean) => {
      if (!user) return { error: translate("errorNeedLogin") };
      return settle(await setItemsUrgent(ids, urgent));
    },
    [settle, user],
  );

  const setManyCategory = useCallback(
    async (ids: string[], category: PurchaseCategory) => {
      if (!user) return { error: translate("errorNeedLogin") };
      return settle(await setItemsCategory(ids, category));
    },
    [settle, user],
  );

  const setManyUnit = useCallback(
    async (ids: string[], unit: string) => {
      if (!user) return { error: translate("errorNeedLogin") };
      return settle(await setItemsUnit(ids, unit));
    },
    [settle, user],
  );

  const setManyLater = useCallback(
    async (ids: string[], until: Date | null) => {
      if (!user) return { error: translate("errorNeedLogin") };
      return settle(await setItemsLater(ids, until ? until.toISOString() : null));
    },
    [settle, user],
  );

  const bringBackMany = useCallback(
    async (ids: string[]) => {
      if (!user) return { error: translate("errorNeedLogin") };
      return settle(await clearItemsLater(ids));
    },
    [settle, user],
  );

  const reorderNeeded = useCallback(
    async (ids: string[]) => {
      if (!user) return { error: translate("errorNeedLogin") };
      return settle(await reorderItems(ids), false);
    },
    [settle, user],
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

  const dataValue = useMemo<PurchasesData>(
    () => ({
      purchases,
      needed,
      later,
      bought,
      getById,
      isLoading: isHomeLoading || isLoading,
      error,
    }),
    [purchases, needed, later, bought, getById, isHomeLoading, isLoading, error],
  );

  const actions = useMemo<PurchaseActions>(
    () => ({
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
    <PurchasesActionsContext.Provider value={actions}>
      <PurchasesDataContext.Provider value={dataValue}>{children}</PurchasesDataContext.Provider>
    </PurchasesActionsContext.Provider>
  );
}

/** Only the actions: does not redraw when items change. */
export function usePurchaseActions(): PurchaseActions {
  const actions = useContext(PurchasesActionsContext);
  if (!actions) {
    throw new Error("usePurchaseActions must be used within PurchasesProvider");
  }
  return actions;
}

function useBoth(name: string): UsePurchasesResult {
  const data = useContext(PurchasesDataContext);
  const actions = useContext(PurchasesActionsContext);
  if (!data || !actions) {
    throw new Error(`${name} must be used within PurchasesProvider`);
  }
  return useMemo(() => ({ ...data, ...actions }), [data, actions]);
}

/** The same data without refreshing on focus; for sheets and small helpers. */
export function usePurchasesData(): UsePurchasesResult {
  return useBoth("usePurchasesData");
}

export function usePurchases(): UsePurchasesResult {
  const value = useBoth("usePurchases");
  const { isLoading: isHomeLoading } = useHousehold();
  const refresh = value.refresh;

  useFocusEffect(
    useCallback(() => {
      if (!refresh || isHomeLoading) return;
      void refresh();
    }, [isHomeLoading, refresh]),
  );

  return value;
}
