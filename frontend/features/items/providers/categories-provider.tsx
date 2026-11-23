import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { AppState } from "react-native";
import { PURCHASE_CATEGORIES, getCategoryLabel } from "@/constants/categories";
import { createCategory, deleteCategory, fetchCategories, type HomeCategory } from "@/features/items/api/categories";
import { emitListChanged, onListChanged } from "@/features/items/utils/list-sync";
import { syncHome } from "@/features/sync/engine";
import { qk, queryClient, readCache } from "@/features/offline/query-client";
import { useHousehold } from "@/features/homes/providers/household-provider";
import { useI18n } from "@/providers/LanguageProvider";

type CategoriesContextValue = {
  categories: HomeCategory[];
  addCategory: (name: string) => Promise<string | null>;
  removeCategory: (id: string) => Promise<string | null>;
};

const CategoriesContext = createContext<CategoriesContextValue | null>(null);

const builtinCategories: HomeCategory[] = PURCHASE_CATEGORIES.map((item) => ({
  id: item.id,
  name: null,
  builtin: true,
}));

export function CategoriesProvider({ children }: { children: ReactNode }) {
  const { household } = useHousehold();
  const homeId = household?.id;

  // A window onto the copy saved on the phone: it follows every load and every
  // change made here, also the ones still waiting for a connection.
  const { data } = useQuery<HomeCategory[]>(
    {
      queryKey: qk.categories(homeId ?? "none"),
      queryFn: () => readCache<HomeCategory[]>(qk.categories(homeId ?? "none")) ?? builtinCategories,
      enabled: false,
    },
    queryClient,
  );
  const categories = homeId ? (data ?? builtinCategories) : builtinCategories;

  useEffect(() => {
    if (!homeId) return;
    // Categories come with the home's sync; the old endpoint covers a failed sync.
    const load = () =>
      void syncHome(homeId).then((result) => {
        if (result.error) void fetchCategories(homeId);
      });
    load();
    // A partner may add or remove a category while this phone is open.
    const stopListening = onListChanged(load);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") load();
    });
    return () => {
      stopListening();
      appState.remove();
    };
  }, [homeId]);

  const addCategory = useCallback(
    async (name: string) => {
      if (!homeId) return null;
      return (await createCategory(homeId, name)).error;
    },
    [homeId],
  );

  const removeCategory = useCallback(
    async (id: string) => {
      if (!homeId) return null;
      const result = await deleteCategory(homeId, id);
      // Its items moved to "Other": every screen showing them reloads.
      if (!result.error) emitListChanged();
      return result.error;
    },
    [homeId],
  );

  const value = useMemo(
    () => ({ categories, addCategory, removeCategory }),
    [categories, addCategory, removeCategory],
  );

  return <CategoriesContext.Provider value={value}>{children}</CategoriesContext.Provider>;
}

export function useCategories() {
  const value = useContext(CategoriesContext);
  if (!value) {
    throw new Error("useCategories must be used within CategoriesProvider");
  }
  return value;
}

export function useCategoryLabel(category: string) {
  const { locale } = useI18n();
  const { categories } = useCategories();
  const match = categories.find((item) => item.id === category);
  if (match && !match.builtin && match.name) return match.name;
  return getCategoryLabel(category, locale);
}

/** Label for any category id; for lists, charts and exports. */
export function useCategoryLabeler() {
  const { locale } = useI18n();
  const { categories } = useCategories();
  return useCallback(
    (category: string) => {
      const match = categories.find((item) => item.id === category);
      if (match && !match.builtin && match.name) return match.name;
      return getCategoryLabel(category, locale);
    },
    [categories, locale],
  );
}
