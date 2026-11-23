import type { Purchase } from "@/features/items/types/purchase";
import { newId } from "@/features/offline/ids";
import { defineChange, perform } from "@/features/offline/outbox";
import { qk, readCache, writeCache } from "@/features/offline/query-client";
import { readThrough } from "@/features/offline/read";
import { isAlreadyGone } from "@/features/offline/rules";
import { api } from "@/lib/api";
import { formatAppError } from "@/lib/errors";

export type HomeCategory = {
  id: string;
  name: string | null;
  builtin: boolean;
};

/** Where the items of a removed category go (the server does the same). */
const FALLBACK_CATEGORY = "other";

export async function fetchCategories(homeId: string) {
  const result = await readThrough<HomeCategory[]>(qk.categories(homeId), () =>
    api.get<HomeCategory[]>(`/homes/${homeId}/categories`),
  );
  if (result.data) return { categories: result.data, error: null };
  return { categories: [] as HomeCategory[], error: formatAppError(result.error) };
}

const createChange = defineChange<{ homeId: string; id: string; name: string }, HomeCategory>(
  "category.create",
  (payload) =>
    api.post<HomeCategory>(`/homes/${payload.homeId}/categories`, {
      id: payload.id,
      name: payload.name,
    }),
);

const deleteChange = defineChange<{ homeId: string; categoryId: string }>(
  "category.delete",
  (payload) => api.delete(`/homes/${payload.homeId}/categories/${payload.categoryId}`),
  { tolerate: isAlreadyGone },
);

function changeCategories(homeId: string, change: (rows: HomeCategory[]) => HomeCategory[]) {
  writeCache<HomeCategory[]>(qk.categories(homeId), (current) =>
    current ? change(current) : current,
  );
}

export async function createCategory(homeId: string, name: string) {
  const category: HomeCategory = { id: newId(), name: name.trim().replace(/\s+/g, " "), builtin: false };
  changeCategories(homeId, (rows) => [...rows, category]);
  const result = await perform(
    createChange,
    { homeId, id: category.id, name: category.name ?? "" },
    { action: "add", title: category.name ?? undefined },
  );
  if (result.error) {
    changeCategories(homeId, (rows) => rows.filter((row) => row.id !== category.id));
    return { category: null, error: result.error };
  }
  return { category: result.data ?? category, error: null };
}

export async function deleteCategory(homeId: string, categoryId: string) {
  const categories = readCache<HomeCategory[]>(qk.categories(homeId));
  const items = readCache<Purchase[]>(qk.items(homeId));
  const title = categories?.find((row) => row.id === categoryId)?.name ?? undefined;
  changeCategories(homeId, (rows) => rows.filter((row) => row.id !== categoryId));
  // Its items move to "Other", here as on the server.
  writeCache<Purchase[]>(qk.items(homeId), (current) =>
    current?.map((item) =>
      item.category === categoryId ? { ...item, category: FALLBACK_CATEGORY } : item,
    ),
  );
  const result = await perform(deleteChange, { homeId, categoryId }, {
    action: "delete",
    ...(title ? { title } : { count: 1 }),
  });
  if (result.error) {
    if (categories) writeCache<HomeCategory[]>(qk.categories(homeId), categories);
    if (items) writeCache<Purchase[]>(qk.items(homeId), items);
  }
  return { error: result.error };
}
