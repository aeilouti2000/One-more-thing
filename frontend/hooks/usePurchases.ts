import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  addItem as insertItem,
  deleteItems,
  reorderItems,
  fetchHomeItems,
  markItemBought,
  markItemsBought,
  undoItemBought,
  updateItemCost,
  updateItemDetails,
  type BoughtCostEntry,
} from "@/lib/items";
import type { NewItemInput, UpdateItemInput } from "@/lib/items";
import { translate } from "@/constants/i18n";
import { emitListChanged, onListChanged } from "@/lib/list-sync";
import { useHousehold } from "@/hooks/useHousehold";
import { useAuth } from "@/providers/AuthProvider";
import type { Purchase, PurchaseStatus } from "@/types/purchase";

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
  updateCost: (id: string, cost: number | null) => Promise<{ error: string | null }>;
  markBought: (id: string, cost?: number | null) => Promise<{ error: string | null }>;
  undoBought: (id: string) => Promise<{ error: string | null }>;
  markManyBought: (entries: BoughtCostEntry[] | string[]) => Promise<{ error: string | null }>;
  deleteMany: (ids: string[]) => Promise<{ error: string | null }>;
  reorderNeeded: (ids: string[]) => Promise<{ error: string | null }>;
};

function toEntries(entries: BoughtCostEntry[] | string[]): BoughtCostEntry[] {
  if (entries.length === 0) return [];
  if (typeof entries[0] === "string") {
    return (entries as string[]).map((id) => ({ id, cost: null }));
  }
  return entries as BoughtCostEntry[];
}

export function usePurchases(): UsePurchasesResult {
  const { user } = useAuth();
  const { household, isLoading: isHomeLoading } = useHousehold();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshSequenceRef = useRef(0);

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequenceRef.current;
    if (!household) {
      if (refreshSequenceRef.current !== sequence) return;
      setPurchases([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    const homeId = household.id;
    const { items, error: fetchError } = await fetchHomeItems(homeId);
    if (refreshSequenceRef.current !== sequence) return;
    setPurchases(items);
    setError(fetchError);
    setIsLoading(false);
  }, [household]);

  useFocusEffect(
    useCallback(() => {
      if (isHomeLoading) return;
      void refresh();
    }, [isHomeLoading, refresh]),
  );

  useEffect(() => onListChanged(() => void refresh()), [refresh]);

  const addItem = useCallback(
    async (values: AddItemValues) => {
      if (!household || !user) {
        return {
          error: translate(!user ? "errorNeedLogin" : "errorNeedHome"),
        };
      }

      const result = await insertItem({
        ...values,
        homeId: household.id,
        userId: user.id,
      });

      if (!result.error) {
        emitListChanged();
      }

      return result;
    },
    [household, user],
  );

  const markBought = useCallback(
    async (id: string, cost?: number | null) => {
      if (!user) {
        return { error: translate("errorNeedLogin") };
      }

      const result = await markItemBought(id, cost);
      if (!result.error) {
        emitListChanged();
      }

      return result;
    },
    [user],
  );

  const updateItem = useCallback(
    async (id: string, values: UpdateItemInput) => {
      if (!user) {
        return { error: translate("errorNeedLogin") };
      }

      const result = await updateItemDetails(id, values);
      if (!result.error) {
        emitListChanged();
      }

      return result;
    },
    [user],
  );

  const updateCost = useCallback(
    async (id: string, cost: number | null) => {
      if (!user) {
        return { error: translate("errorNeedLogin") };
      }

      const result = await updateItemCost(id, cost);
      if (!result.error) {
        emitListChanged();
      }

      return result;
    },
    [user],
  );

  const undoBought = useCallback(
    async (id: string) => {
      if (!user) {
        return { error: translate("errorNeedLogin") };
      }

      const result = await undoItemBought(id);
      if (!result.error) {
        emitListChanged();
      }

      return result;
    },
    [user],
  );

  const markManyBought = useCallback(
    async (entries: BoughtCostEntry[] | string[]) => {
      if (!user) {
        return { error: translate("errorNeedLogin") };
      }

      const result = await markItemsBought(toEntries(entries));
      if (!result.error) {
        emitListChanged();
      }

      return result;
    },
    [user],
  );

  const deleteMany = useCallback(
    async (ids: string[]) => {
      if (!user) {
        return { error: translate("errorNeedLogin") };
      }

      const result = await deleteItems(ids);
      if (!result.error) {
        emitListChanged();
      }

      return result;
    },
    [user],
  );

  const reorderNeeded = useCallback(
    async (ids: string[]) => {
      if (!user) {
        return { error: translate("errorNeedLogin") };
      }

      setPurchases((current) => {
        const needed = current.filter((item) => item.status === "needed");
        const bought = current.filter((item) => item.status === "bought");
        const byId = new Map(needed.map((item) => [item.id, item]));
        const moving = new Set(ids);
        const queue = ids.filter((id) => byId.has(id));
        const nextNeeded = needed.map((item) => {
          if (!moving.has(item.id)) return item;
          const id = queue.shift();
          return (id && byId.get(id)) || item;
        });
        return [...nextNeeded, ...bought];
      });

      const result = await reorderItems(ids);
      if (result.error) await refresh();
      else emitListChanged();
      return result;
    },
    [refresh, user],
  );

  const needed = purchases.filter((item) => item.status === "needed");
  const bought = purchases
    .filter((item) => item.status === "bought")
    .sort((a, b) => (b.boughtAt ?? "").localeCompare(a.boughtAt ?? ""));

  return {
    purchases,
    needed,
    bought,
    getById: (id) => purchases.find((item) => item.id === id),
    isLoading: isHomeLoading || isLoading,
    error,
    refresh,
    addItem,
    updateItem,
    updateCost,
    markBought,
    undoBought,
    markManyBought,
    deleteMany,
    reorderNeeded,
  };
}

export function filterPurchasesByStatus(
  purchases: Purchase[],
  status: PurchaseStatus,
) {
  return purchases.filter((item) => item.status === status);
}
