import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import { PURCHASE_CATEGORIES, getCategoryLabel } from "@/constants/categories";
import { createCategory, deleteCategory, fetchCategories, type HomeCategory } from "@/features/items/api/categories";
import { emitListChanged, onListChanged } from "@/features/items/utils/list-sync";
import { readCachedCategories, writeCachedCategories } from "@/features/offline/profile-cache";
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
  const [categories, setCategories] = useState<HomeCategory[]>(builtinCategories);
  const homeId = household?.id;
  const [trackedHomeId, setTrackedHomeId] = useState(homeId);

  if (homeId !== trackedHomeId) {
    setTrackedHomeId(homeId);
    if (!homeId) setCategories(builtinCategories);
    else setCategories(readCachedCategories<HomeCategory>(homeId) ?? builtinCategories);
  }

  useEffect(() => {
    if (!homeId) return;
    let cancelled = false;
    const load = () => {
      void fetchCategories(homeId).then((result) => {
        if (cancelled || result.error) return;
        setCategories(result.categories);
      });
    };
    load();
    // A partner may add or remove a category while this phone is open.
    const stopListening = onListChanged(load);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") load();
    });
    return () => {
      cancelled = true;
      stopListening();
      appState.remove();
    };
  }, [homeId]);

  const addCategory = useCallback(
    async (name: string) => {
      if (!homeId) return null;
      const result = await createCategory(homeId, name);
      if (result.category) {
        setCategories((current) => {
          const next = [...current, result.category];
          writeCachedCategories(homeId, next);
          return next;
        });
      }
      return result.error;
    },
    [homeId],
  );

  const removeCategory = useCallback(
    async (id: string) => {
      if (!homeId) return null;
      const result = await deleteCategory(homeId, id);
      if (!result.error) {
        setCategories((current) => {
          const next = current.filter((item) => item.id !== id);
          writeCachedCategories(homeId, next);
          return next;
        });
        // The server moved its items to "Other": show them there right away.
        emitListChanged();
      }
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
