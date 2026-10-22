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
import {
  addItem as insertItem,
  deleteItems,
  moveItems,
  reorderItems,
  fetchHomeItems,
  markItemBought,
  markItemsBought,
  setItemsUrgent,
  undoItemBought,
  updateItemCost,
  updateItemDetails,
  type BoughtCostEntry,
  type NewItemInput,
  type UpdateItemInput,
} from "@/features/items/api/items";
import { translate } from "@/constants/i18n";
import { isOfflineMessage } from "@/lib/errors";
import {
  emitListChanged,
  onListChanged,
} from "@/features/items/utils/list-sync";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { readCachedItems, writeCachedItems } from "@/features/offline/profile-cache";
import type { Purchase, PurchaseStatus } from "@/features/items/types/purchase";

type AddItemValues = Omit<NewItemInput, "homeId" | "userId">;

type UsePurchasesResult = {
  purchases: Purchase[];
  needed: Purchase[];
  bought: Purchase[];
  getById: (id: string) => Purchase | undefined;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addItem: (values: AddItemValues) => Promise<{ error: string | null }>;
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
  markBought: (
    id: string,
    cost?: number | null,
  ) => Promise<{ error: string | null }>;
  undoBought: (id: string) => Promise<{ error: string | null }>;
  markManyBought: (
    entries: BoughtCostEntry[] | string[],
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
  reorderNeeded: (ids: string[]) => Promise<{ error: string | null }>;
};

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
    if (activeHome) writeCachedItems(activeHome, items);
  }, []);

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
            const { items, error: fetchError } =
              await fetchHomeItems(activeHome);
            if (homeIdRef.current !== activeHome) continue;
            if (pendingWrites.current > 0) {
              setIsLoading(false);
              break;
            }
            if (revision.current !== seen || wantedRef.current !== ticket)
              continue;
            if (fetchError && isOfflineMessage(fetchError)) {
              const cached = readCachedItems(activeHome);
              setPurchases(cached ?? []);
              setError(cached ? null : fetchError);
            } else {
              setPurchases(items);
              setError(fetchError);
              if (!fetchError) writeCachedItems(activeHome, items);
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

  const noteLocalChange = useCallback(() => {
    revision.current += 1;
    pendingWrites.current += 1;
    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      pendingWrites.current = Math.max(0, pendingWrites.current - 1);
    };
  }, []);

  const addItem = useCallback(
    async (values: AddItemValues) => {
      if (!household || !user) {
        return {
          error: translate(!user ? "errorNeedLogin" : "errorNeedHome"),
        };
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
        listId: values.listId,
        addedByName: user.name,
        createdAt: new Date().toISOString(),
      };

      const endLocalChange = noteLocalChange();
      setPurchases((current) => placeNeededLocally(current, optimistic));

      let result: { item: Purchase | null; error: string | null };
      try {
        result = await insertItem({
          ...values,
          homeId: household.id,
          userId: user.id,
        });
      } finally {
        endLocalChange();
      }

      if (result.error) {
        setPurchases((current) => current.filter((item) => item.id !== tempId));
        await refresh();
        return { error: result.error };
      }

      if (result.item) {
        const created = result.item;
        setPurchases((current) =>
          current.map((item) => (item.id === tempId ? created : item)),
        );
        rememberItems(
          purchasesRef.current.map((item) =>
            item.id === tempId ? created : item,
          ),
        );
      } else {
        emitListChanged();
      }
      return { error: null };
    },
    [household, noteLocalChange, refresh, rememberItems, user],
  );

  const markBought = useCallback(
    async (id: string, cost?: number | null) => {
      if (!user) return { error: translate("errorNeedLogin") };
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
      let result: { error: string | null };
      try {
        result = await markItemBought(id, cost);
      } finally {
        endLocalChange();
      }
      if (result.error) await refresh();
      else rememberItems(purchasesRef.current);
      return result;
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
      if (result.error) await refresh();
      else rememberItems(purchasesRef.current);
      return result;
    },
    [noteLocalChange, refresh, rememberItems, user],
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
    async (id: string) => {
      if (!user) return { error: translate("errorNeedLogin") };
      const endLocalChange = noteLocalChange();
      setPurchases((current) =>
        current.map((item) =>
          item.id === id && item.status === "bought"
            ? {
                ...item,
                status: "needed",
                boughtAt: undefined,
                boughtByName: undefined,
                cost: null,
              }
            : item,
        ),
      );
      let result: { error: string | null };
      try {
        result = await undoItemBought(id);
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

  const markManyBought = useCallback(
    async (entries: BoughtCostEntry[] | string[]) => {
      if (!user) return { error: translate("errorNeedLogin") };
      const endLocalChange = noteLocalChange();
      const prepared = toEntries(entries);
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
        result = await markItemsBought(prepared);
      } finally {
        endLocalChange();
      }
      if (result.error) await refresh();
      else rememberItems(purchasesRef.current);
      return result;
    },
    [noteLocalChange, refresh, rememberItems, user],
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
    () => purchases.filter((item) => item.status === "needed"),
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
      bought,
      getById,
      isLoading: isHomeLoading || isLoading,
      error,
      refresh,
      addItem,
      updateItem,
      updateCost,
      updateCosts,
      markBought,
      undoBought,
      markManyBought,
      deleteMany,
      moveMany,
      setManyUrgent,
      reorderNeeded,
    }),
    [
      purchases,
      needed,
      bought,
      getById,
      isHomeLoading,
      isLoading,
      error,
      refresh,
      addItem,
      updateItem,
      updateCost,
      updateCosts,
      markBought,
      undoBought,
      markManyBought,
      deleteMany,
      moveMany,
      setManyUrgent,
      reorderNeeded,
    ],
  );

  return (
    <PurchasesContext.Provider value={value}>
      {children}
    </PurchasesContext.Provider>
  );
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

export function filterPurchasesByStatus(
  purchases: Purchase[],
  status: PurchaseStatus,
) {
  return purchases.filter((item) => item.status === status);
}

/** Mirror backend placeNeeded: urgent at top, else after the urgent block. */
function placeNeededLocally(purchases: Purchase[], item: Purchase): Purchase[] {
  const needed = purchases.filter((row) => row.status === "needed");
  const bought = purchases.filter((row) => row.status === "bought");
  if (item.urgent) return [item, ...needed, ...bought];
  const index = needed.findIndex((row) => !row.urgent);
  const nextNeeded =
    index === -1
      ? [...needed, item]
      : [...needed.slice(0, index), item, ...needed.slice(index)];
  return [...nextNeeded, ...bought];
}
