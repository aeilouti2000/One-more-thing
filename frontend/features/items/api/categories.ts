import { api } from "@/lib/api";
import { formatAppError, isOfflineError } from "@/lib/errors";
import { readCachedCategories, writeCachedCategories } from "@/features/offline/profile-cache";

export type HomeCategory = {
  id: string;
  name: string | null;
  builtin: boolean;
};

export async function fetchCategories(homeId: string) {
  try {
    const categories = await api.get<HomeCategory[]>(`/homes/${homeId}/categories`);
    writeCachedCategories(homeId, categories);
    return { categories, error: null };
  } catch (error) {
    if (isOfflineError(error)) {
      const cached = readCachedCategories<HomeCategory>(homeId);
      if (cached) return { categories: cached, error: null };
    }
    return { categories: [] as HomeCategory[], error: formatAppError(error) };
  }
}

export async function createCategory(homeId: string, name: string) {
  try {
    const category = await api.post<HomeCategory>(`/homes/${homeId}/categories`, { name: name.trim() });
    return { category, error: null };
  } catch (error) {
    return { category: null, error: formatAppError(error) };
  }
}

export async function deleteCategory(homeId: string, categoryId: string) {
  try {
    await api.delete(`/homes/${homeId}/categories/${categoryId}`);
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}
