import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  addItem as insertItem,
  deleteItems,
  fetchHomeItems,
  markItemBought,
  markItemsBought,
  updateItemDetails,
} from "@/lib/items";
import type { NewItemInput, UpdateItemInput } from "@/lib/items";
import { translate } from "@/constants/i18n";
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
  markBought: (id: string) => Promise<{ error: string | null }>;
  markManyBought: (ids: string[]) => Promise<{ error: string | null }>;
  deleteMany: (ids: string[]) => Promise<{ error: string | null }>;
};

export function usePurchases(): UsePurchasesResult {
  const { user } = useAuth();
  const { household, isLoading: isHomeLoading } = useHousehold();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!household) {
      setPurchases([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    const { items, error: fetchError } = await fetchHomeItems(household.id);
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
        await refresh();
      }

      return result;
    },
    [household, refresh, user],
  );

  const markBought = useCallback(
    async (id: string) => {
      if (!user) {
        return { error: translate("errorNeedLogin") };
      }

      const result = await markItemBought(id);
      if (!result.error) {
        await refresh();
      }

      return result;
    },
    [refresh, user],
  );

  const updateItem = useCallback(
    async (id: string, values: UpdateItemInput) => {
      if (!user) {
        return { error: translate("errorNeedLogin") };
      }

      const result = await updateItemDetails(id, values);
      if (!result.error) {
        await refresh();
      }

      return result;
    },
    [refresh, user],
  );

  const markManyBought = useCallback(
    async (ids: string[]) => {
      if (!user) {
        return { error: translate("errorNeedLogin") };
      }

      const result = await markItemsBought(ids);
      if (!result.error) {
        await refresh();
      }

      return result;
    },
    [refresh, user],
  );

  const deleteMany = useCallback(
    async (ids: string[]) => {
      if (!user) {
        return { error: translate("errorNeedLogin") };
      }

      const result = await deleteItems(ids);
      if (!result.error) {
        await refresh();
      }

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
    markBought,
    markManyBought,
    deleteMany,
  };
}

export function filterPurchasesByStatus(
  purchases: Purchase[],
  status: PurchaseStatus,
) {
  return purchases.filter((item) => item.status === status);
}
