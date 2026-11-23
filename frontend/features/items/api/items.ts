import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import {
  keepLocalPhotos,
  sharedReceiptId,
  withAdded,
  withBought,
  withCosts,
  withDetails,
  withNeededPatch,
  withNotFound,
  withOrder,
  withReceipt,
  withUndone,
  without,
  type DetailChanges,
} from "@/features/items/utils/optimistic";
import { newId } from "@/features/offline/ids";
import {
  defineChange,
  pendingEntries,
  perform,
  type ChangeKind,
  type ChangeLabel,
} from "@/features/offline/outbox";
import { qk, queryClient, readCache, writeCache } from "@/features/offline/query-client";
import { readThrough } from "@/features/offline/read";
import { isAlreadyGone } from "@/features/offline/rules";
import { api, ApiError, apiUrl, readSession } from "@/lib/api";
import { formatAppError } from "@/lib/errors";
import type { Purchase, PurchaseCategory } from "@/features/items/types/purchase";

export type NewItemInput = {
  /** Made on the phone when left out. */
  id?: string;
  homeId: string;
  userId: string;
  name: string;
  quantity: number;
  category: PurchaseCategory;
  notes?: string;
  unit?: string;
  urgent?: boolean;
  listId?: string;
};

export type UpdateItemInput = Pick<
  NewItemInput,
  "name" | "quantity" | "category" | "urgent" | "notes" | "unit"
>;

/** `direct`: skip the waiting queue and report a missing connection as an error. */
export type CallOptions = { direct?: boolean };

export type BoughtCostEntry = {
  id: string;
  cost?: number | null;
};

type ItemResponse = {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  category: PurchaseCategory;
  notes: string | null;
  status: Purchase["status"];
  urgent: boolean;
  cost?: number | null;
  receiptId?: string | null;
  receiptTotal?: number | string | null;
  receiptName?: string | null;
  imageId?: string | null;
  listId?: string;
  listName?: string;
  addedByName: string;
  addedBy?: string | null;
  boughtByName: string | null;
  boughtBy?: string | null;
  createdAt: string;
  boughtAt: string | null;
  notFoundAt?: string | null;
  notFoundBy?: string | null;
  notFoundByName?: string | null;
  laterAt?: string | null;
  laterUntil?: string | null;
};

function toPurchase(item: ItemResponse): Purchase {
  const quantity = Number(item.quantity);
  const cost =
    item.cost === null || item.cost === undefined
      ? null
      : Number.isFinite(Number(item.cost))
        ? Number(item.cost)
        : null;
  return {
    id: item.id,
    name: item.name,
    quantity: Number.isFinite(quantity) ? quantity : 1,
    unit: item.unit ?? undefined,
    category: item.category,
    notes: item.notes ?? undefined,
    status: item.status,
    urgent: Boolean(item.urgent),
    cost,
    receiptId: item.receiptId ?? null,
    receiptTotal:
      item.receiptTotal === null || item.receiptTotal === undefined
        ? null
        : Number.isFinite(Number(item.receiptTotal))
          ? Number(item.receiptTotal)
          : null,
    receiptName: item.receiptName ?? null,
    imageId: item.imageId ?? null,
    listId: item.listId,
    listName: item.listName,
    addedByName: item.addedByName,
    addedById: item.addedBy ?? undefined,
    boughtByName: item.boughtByName ?? undefined,
    boughtById: item.boughtBy ?? undefined,
    createdAt: item.createdAt,
    boughtAt: item.boughtAt ?? undefined,
    notFoundAt: item.notFoundAt ?? undefined,
    notFoundById: item.notFoundBy ?? undefined,
    notFoundByName: item.notFoundByName ?? undefined,
    laterAt: item.laterAt ?? undefined,
    laterUntil: item.laterUntil ?? undefined,
  };
}

/* ------------------------------------------------------------------------ */
/* The copy of each home's items saved on this phone                          */
/* ------------------------------------------------------------------------ */

type ItemsChange = (items: Purchase[]) => Purchase[];

/** The items of a home as this phone has them; undefined when never loaded. */
export function cachedItems(homeId: string) {
  return readCache<Purchase[]>(qk.items(homeId));
}

function changeHome(homeId: string, change: ItemsChange) {
  writeCache<Purchase[]>(qk.items(homeId), (current) => (current ? change(current) : current));
}

/** Every saved list of items, with its home. */
function savedHomes(): { homeId: string; items: Purchase[] }[] {
  return queryClient
    .getQueriesData<Purchase[]>({ queryKey: ["items"] })
    .flatMap(([key, items]) =>
      Array.isArray(items) && typeof key[1] === "string" ? [{ homeId: key[1], items }] : [],
    );
}

/** Applies a change to the home(s) these items are in. */
function changeHolding(ids: string[], change: ItemsChange) {
  const wanted = new Set(ids);
  for (const home of savedHomes()) {
    if (home.items.some((item) => wanted.has(item.id))) changeHome(home.homeId, change);
  }
}

function findItem(id: string) {
  for (const home of savedHomes()) {
    const item = home.items.find((entry) => entry.id === id);
    if (item) return { homeId: home.homeId, item, items: home.items };
  }
  return null;
}

/** What the "Waiting to sync" sheet calls these items: the name of one, or how many. */
function labelFor(action: ChangeLabel["action"], ids: string[]): ChangeLabel {
  if (ids.length === 1) {
    const name = findItem(ids[0])?.item.name;
    return name ? { action, title: name } : { action, count: 1 };
  }
  return { action, count: ids.length };
}

/** Puts the server's version of an item in place of the phone's. */
export function putItem(item: Purchase) {
  changeHolding([item.id], (items) =>
    items.map((entry) =>
      entry.id === item.id
        ? { ...item, localImageUri: entry.localImageUri, photoUploading: entry.photoUploading }
        : entry,
    ),
  );
}

function me() {
  const user = readSession()?.user;
  return user ? { id: user.id, name: user.name } : undefined;
}

export async function fetchHomeItems(homeId: string) {
  const result = await readThrough<Purchase[]>(
    qk.items(homeId),
    async () => (await api.get<ItemResponse[]>(`/homes/${homeId}/items`)).map(toPurchase),
    keepLocalPhotos,
  );
  if (result.data) return { items: result.data, error: null, offline: result.offline };
  // offline: no answer from the server (no connection, or it is still waking).
  return { items: [] as Purchase[], error: formatAppError(result.error), offline: result.offline };
}

/* ------------------------------------------------------------------------ */
/* The changes, as the server takes them                                      */
/* ------------------------------------------------------------------------ */

type AddBody = {
  id: string;
  name: string;
  quantity: number;
  category: PurchaseCategory;
  notes?: string;
  unit?: string;
  urgent: boolean;
  listId?: string;
};

const addChange = defineChange<{ homeId: string; body: AddBody }, ItemResponse>("item.add", (payload) =>
  api.post<ItemResponse>(`/homes/${payload.homeId}/items`, payload.body),
);

const updateChange = defineChange<{ id: string; body: DetailChanges }>("item.update", (payload) =>
  api.patch(`/items/${payload.id}`, payload.body),
);

const costChange = defineChange<{ id: string; cost: number | null }>("item.cost", (payload) =>
  api.patch(`/items/${payload.id}/cost`, { cost: payload.cost }),
);

const boughtChange = defineChange<
  { id: string; cost: number | null; receiptId?: string | null },
  ItemResponse
>("item.bought", (payload) =>
  api.post<ItemResponse>(`/items/${payload.id}/bought`, {
    cost: payload.cost,
    ...(payload.receiptId ? { receiptId: payload.receiptId } : {}),
  }),
);

const undoChange = defineChange<{ id: string; onlyMine?: boolean }>("item.undo", (payload) =>
  api.post(`/items/${payload.id}/needed`, payload.onlyMine ? { onlyMine: true } : undefined),
);

const notFoundChange = defineChange<{ id: string; notFound: boolean }, ItemResponse>(
  "item.notFound",
  (payload) =>
    payload.notFound
      ? api.post<ItemResponse>(`/items/${payload.id}/not-found`)
      : api.delete<ItemResponse>(`/items/${payload.id}/not-found`),
);

const manyBoughtChange = defineChange<{
  items: { id: string; cost: number | null }[];
  receiptId?: string | null;
}>("items.bought", (payload) =>
  api.post("/items/bought", {
    items: payload.items,
    ...(payload.receiptId ? { receiptId: payload.receiptId } : {}),
  }),
);

const orderChange = defineChange<{ ids: string[] }>("items.order", (payload) =>
  api.post("/items/order", { ids: payload.ids }),
);

const deleteChange = defineChange<{ ids: string[] }>(
  "items.delete",
  (payload) => api.post("/items/delete", { ids: payload.ids }),
  // Already deleted (on another phone) is what was asked for.
  { tolerate: isAlreadyGone },
);

const urgentChange = defineChange<{ ids: string[]; urgent: boolean }>("items.urgent", (payload) =>
  api.post("/items/urgent", payload),
);

const laterChange = defineChange<{ ids: string[]; until: string | null }>("items.later", (payload) =>
  api.post("/items/later", payload),
);

const laterClearChange = defineChange<{ ids: string[] }>("items.laterClear", (payload) =>
  api.post("/items/later/clear", payload),
);

const categoryChange = defineChange<{ ids: string[]; category: PurchaseCategory }>(
  "items.category",
  (payload) => api.post("/items/category", payload),
);

const unitChange = defineChange<{ ids: string[]; unit: string }>("items.unit", (payload) =>
  api.post("/items/unit", payload),
);

const moveChange = defineChange<{ ids: string[]; listId: string }>("items.move", (payload) =>
  api.post("/items/move", payload),
);

type ReceiptBody = {
  id: string;
  total: number | null;
  itemIds: string[];
  listId?: string;
  name?: string | null;
};
type ReceiptAnswer = { receipt: { id: string; total: number | null; name: string | null } };

const receiptChange = defineChange<{ homeId: string; body: ReceiptBody }, ReceiptAnswer>(
  "receipt.create",
  (payload) => api.post<ReceiptAnswer>(`/homes/${payload.homeId}/receipts`, payload.body),
);

const receiptNameChange = defineChange<{ receiptId: string; name: string | null }>(
  "receipt.rename",
  (payload) => api.patch(`/receipts/${payload.receiptId}`, { name: payload.name }),
);

const receiptMoveChange = defineChange<{ id: string; receiptId: string; utcOffsetMin: number }>(
  "item.receipt",
  (payload) =>
    api.post(`/items/${payload.id}/receipt`, {
      receiptId: payload.receiptId,
      utcOffsetMin: payload.utcOffsetMin,
    }),
);

/* ------------------------------------------------------------------------ */
/* What the screens call                                                      */
/* ------------------------------------------------------------------------ */

/**
 * Adds an item. The row is on the list at once, under an id made here; the
 * server saves it under the same id, now or when the connection returns.
 */
export async function addItem(
  input: NewItemInput & { addedByName?: string; localImageUri?: string },
  options?: CallOptions,
) {
  const id = input.id ?? newId();
  const body: AddBody = {
    id,
    name: input.name.trim(),
    quantity: input.quantity,
    category: input.category,
    notes: input.notes?.trim() || undefined,
    unit: input.unit?.trim() || undefined,
    urgent: input.urgent === true,
    listId: input.listId,
  };
  const optimistic: Purchase = {
    id,
    name: body.name,
    quantity: body.quantity,
    unit: body.unit,
    category: body.category,
    notes: body.notes,
    status: "needed",
    urgent: body.urgent,
    cost: null,
    localImageUri: input.localImageUri,
    photoUploading: Boolean(input.localImageUri),
    listId: body.listId,
    addedByName: input.addedByName ?? me()?.name ?? "",
    addedById: input.userId,
    createdAt: new Date().toISOString(),
  };
  if (!options?.direct) changeHome(input.homeId, (items) => withAdded(items, optimistic));

  const result = await perform(
    addChange,
    { homeId: input.homeId, body },
    { action: "add", title: body.name },
    options,
  );
  if (result.error) {
    if (!options?.direct) changeHome(input.homeId, (items) => without(items, [id]));
    return { item: null as Purchase | null, error: result.error, queued: false };
  }
  if (!result.data) return { item: optimistic, error: null, queued: result.queued };
  const saved = toPurchase(result.data);
  if (!options?.direct) {
    // The server's row (its list name, its place), keeping a photo still on its way.
    changeHome(input.homeId, (items) =>
      items.map((item) =>
        item.id === id
          ? { ...saved, localImageUri: item.localImageUri, photoUploading: item.photoUploading }
          : item,
      ),
    );
  }
  return { item: saved, error: null, queued: false };
}

/**
 * Shows an item on the list that another request creates on the server (a pin
 * added "now", under this same id). Returns how to take it off again.
 */
export function addItemLocally(
  homeId: string,
  input: {
    id: string;
    name: string;
    quantity: number;
    category: PurchaseCategory;
    unit?: string;
    urgent?: boolean;
    listId?: string;
  },
) {
  const actor = me();
  const lists = readCache<{ id: string }[]>(qk.lists(homeId));
  const item: Purchase = {
    id: input.id,
    name: input.name.trim(),
    quantity: input.quantity,
    unit: input.unit?.trim() || undefined,
    category: input.category,
    status: "needed",
    urgent: input.urgent === true,
    cost: null,
    // No list named: the home's first one, like the server picks.
    listId: input.listId ?? lists?.[0]?.id,
    addedByName: actor?.name ?? "",
    addedById: actor?.id,
    createdAt: new Date().toISOString(),
  };
  changeHome(homeId, (items) => withAdded(items, item));
  return () => changeHome(homeId, (items) => without(items, [input.id]));
}

/** Changes an item's details. Only the fields that differ are sent. */
export async function updateItemDetails(itemId: string, changes: DetailChanges) {
  if (Object.keys(changes).length === 0) return { error: null, queued: false };
  const label = labelFor("edit", [itemId]);
  changeHolding([itemId], (items) => withDetails(items, itemId, changes));
  const result = await perform(updateChange, { id: itemId, body: changes }, label);
  return { error: result.error, queued: result.queued };
}

export async function updateItemCost(itemId: string, cost: number | null) {
  const label = labelFor("price", [itemId]);
  changeHolding([itemId], (items) => withCosts(items, new Map([[itemId, cost]])));
  const result = await perform(costChange, { id: itemId, cost }, label);
  return { error: result.error, queued: result.queued };
}

/**
 * Save an invoice for a trip and link its bought items to it. `total: null`
 * creates it without a total (a named trip, or a target to move items into).
 */
export async function createTripReceipt(
  homeId: string,
  input: { total: number | null; itemIds: string[]; listId?: string | null; name?: string | null },
) {
  const current = cachedItems(homeId) ?? [];
  // Re-pricing the invoice these items already share keeps its id (like the
  // server does); otherwise the new invoice gets an id made here.
  const id = sharedReceiptId(current, input.itemIds) ?? newId();
  const name = input.name === undefined ? undefined : input.name?.trim() || null;
  changeHome(homeId, (items) =>
    withReceipt(items, input.itemIds, {
      id,
      ...(input.total !== null ? { total: input.total } : {}),
      ...(name !== undefined ? { name } : {}),
    }),
  );
  const result = await perform(
    receiptChange,
    {
      homeId,
      body: {
        id,
        total: input.total,
        itemIds: input.itemIds,
        ...(input.listId ? { listId: input.listId } : {}),
        ...(name !== undefined ? { name } : {}),
      },
    },
    { action: "invoice", ...(name ? { title: name } : { count: input.itemIds.length }) },
  );
  if (result.error) return { receipt: null, error: result.error, queued: false };
  const receipt = result.data?.receipt ?? { id, total: input.total, name: name ?? null };
  if (result.data && receipt.id !== id) {
    // The server kept an older invoice instead: follow its id.
    changeHome(homeId, (items) =>
      items.map((item) => (item.receiptId === id ? { ...item, receiptId: receipt.id } : item)),
    );
  }
  return { receipt, error: null, queued: result.queued };
}

export async function renameTripReceipt(receiptId: string, name: string | null) {
  const next = name?.trim() || null;
  for (const home of savedHomes()) {
    if (home.items.some((item) => item.receiptId === receiptId)) {
      changeHome(home.homeId, (items) => withReceipt(items, [], { id: receiptId, name: next }));
    }
  }
  const result = await perform(
    receiptNameChange,
    { receiptId, name: next },
    { action: "invoice", ...(next ? { title: next } : { count: 1 }) },
  );
  return { error: result.error, queued: result.queued };
}

/** Move a bought item to another invoice of the same month. */
export async function moveItemToReceipt(itemId: string, receiptId: string) {
  const label = labelFor("invoice", [itemId]);
  const found = findItem(itemId);
  if (found) {
    const target = found.items.find((item) => item.receiptId === receiptId);
    changeHome(found.homeId, (items) =>
      items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              receiptId,
              receiptTotal: target?.receiptTotal ?? null,
              receiptName: target?.receiptName ?? null,
            }
          : item,
      ),
    );
  }
  const result = await perform(
    receiptMoveChange,
    { id: itemId, receiptId, utcOffsetMin: -new Date().getTimezoneOffset() },
    label,
  );
  return { error: result.error, queued: result.queued };
}

/** onlyMine: from a trip, so a partner's purchase is never taken back. */
export async function undoItemBought(itemId: string, options?: { onlyMine?: boolean }) {
  const label = labelFor("undo", [itemId]);
  changeHolding([itemId], (items) => withUndone(items, itemId));
  const result = await perform(undoChange, { id: itemId, onlyMine: options?.onlyMine }, label);
  return { error: result.error, queued: result.queued };
}

/** Returns the item as the server has it: someone else may have bought it first. */
export async function markItemBought(
  itemId: string,
  cost?: number | null,
  receiptId?: string | null,
  options?: CallOptions,
) {
  const label = labelFor("buy", [itemId]);
  if (!options?.direct) {
    const found = findItem(itemId);
    const invoice = receiptId ? found?.items.find((item) => item.receiptId === receiptId) : undefined;
    changeHolding([itemId], (items) =>
      withBought(
        items,
        new Map([[itemId, cost ?? null]]),
        new Date().toISOString(),
        me(),
        receiptId
          ? { id: receiptId, total: invoice?.receiptTotal ?? null, name: invoice?.receiptName ?? null }
          : null,
      ),
    );
  }
  const result = await perform(
    boughtChange,
    { id: itemId, cost: cost ?? null, receiptId },
    label,
    options,
  );
  if (result.error) return { item: null as Purchase | null, error: result.error, queued: false };
  return {
    item: result.data ? toPurchase(result.data) : null,
    error: null as string | null,
    queued: result.queued,
  };
}

/** "Couldn't find it" in this shop (or put it back, with notFound false). */
export async function setItemNotFound(itemId: string, notFound: boolean) {
  const label = labelFor(notFound ? "notFound" : "found", [itemId]);
  const actor = me();
  changeHolding([itemId], (items) =>
    withNotFound(
      items,
      itemId,
      notFound && actor ? { at: new Date().toISOString(), by: actor } : null,
    ),
  );
  const result = await perform(notFoundChange, { id: itemId, notFound }, label);
  if (result.error) return { item: null as Purchase | null, error: result.error, queued: false };
  return {
    item: result.data ? toPurchase(result.data) : null,
    error: null as string | null,
    queued: result.queued,
  };
}

export async function markItemsBought(entries: BoughtCostEntry[], receiptId?: string | null) {
  if (entries.length === 0) return { error: null, queued: false };
  const items = entries.map((entry) => ({ id: entry.id, cost: entry.cost ?? null }));
  const ids = items.map((entry) => entry.id);
  const label = labelFor("buy", ids);
  const invoice = receiptId
    ? findItem(ids[0])?.items.find((item) => item.receiptId === receiptId)
    : undefined;
  changeHolding(ids, (current) =>
    withBought(
      current,
      new Map(items.map((entry) => [entry.id, entry.cost])),
      new Date().toISOString(),
      me(),
      receiptId
        ? { id: receiptId, total: invoice?.receiptTotal ?? null, name: invoice?.receiptName ?? null }
        : null,
    ),
  );
  const result = await perform(manyBoughtChange, { items, receiptId }, label);
  return { error: result.error, queued: result.queued };
}

/** A change to many needed items: on the phone at once, then sent. */
async function changeMany<P extends { ids: string[] }>(
  kind: ChangeKind<P, unknown>,
  payload: P,
  action: ChangeLabel["action"],
  change: ItemsChange,
  options?: CallOptions,
) {
  if (payload.ids.length === 0) return { error: null, queued: false };
  // Before the change: a deleted row has no name to show any more.
  const label = labelFor(action, payload.ids);
  if (!options?.direct) changeHolding(payload.ids, change);
  const result = await perform(kind, payload, label, options);
  return { error: result.error, queued: result.queued };
}

export function reorderItems(itemIds: string[]) {
  return changeMany(orderChange, { ids: itemIds }, "reorder", (items) => withOrder(items, itemIds));
}

export function deleteItems(itemIds: string[]) {
  return changeMany(deleteChange, { ids: itemIds }, "delete", (items) => without(items, itemIds));
}

export function setItemsUrgent(itemIds: string[], urgent: boolean) {
  return changeMany(urgentChange, { ids: itemIds, urgent }, "urgent", (items) =>
    withNeededPatch(items, itemIds, { urgent }),
  );
}

/** Parks items on the Later shelf; `until` (ISO) is when they return by themselves. */
export function setItemsLater(itemIds: string[], until: string | null) {
  return changeMany(laterChange, { ids: itemIds, until }, "later", (items) =>
    withNeededPatch(items, itemIds, {
      laterAt: new Date().toISOString(),
      laterUntil: until ?? undefined,
    }),
  );
}

/** Brings parked items back to the list now. */
export function clearItemsLater(itemIds: string[], options?: CallOptions) {
  return changeMany(
    laterClearChange,
    { ids: itemIds },
    "back",
    (items) => withNeededPatch(items, itemIds, { laterAt: undefined, laterUntil: undefined }),
    options,
  );
}

export function setItemsCategory(itemIds: string[], category: PurchaseCategory) {
  return changeMany(categoryChange, { ids: itemIds, category }, "edit", (items) =>
    withNeededPatch(items, itemIds, { category }),
  );
}

/** unit "" clears it (plain pieces). */
export function setItemsUnit(itemIds: string[], unit: string) {
  const value = unit.trim();
  return changeMany(unitChange, { ids: itemIds, unit: value }, "edit", (items) =>
    withNeededPatch(items, itemIds, { unit: value || undefined }),
  );
}

export function moveItems(itemIds: string[], listId: string) {
  return changeMany(moveChange, { ids: itemIds, listId }, "move", (items) =>
    withNeededPatch(items, itemIds, { listId }),
  );
}

/* ------------------------------------------------------------------------ */
/* Photos                                                                     */
/* ------------------------------------------------------------------------ */

export type PickedPhoto = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
};

/** Where <Image> loads an item photo from. */
export function itemImageUrl(imageId: string) {
  return apiUrl(`/item-images/${imageId}`);
}

/** Photos waiting to be uploaded live here, where the phone never clears them. */
const KEPT_PHOTOS = "waiting-photos";

/**
 * Copies a picked photo out of the temporary folder, so it is still there when
 * the upload finally runs (maybe after the app was closed and opened again).
 */
async function keepPhoto(photo: PickedPhoto): Promise<PickedPhoto> {
  if (Platform.OS === "web") return photo;
  try {
    const folder = new Directory(Paths.document, KEPT_PHOTOS);
    if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
    const extension = /\.(\w{2,5})$/.exec(photo.fileName ?? photo.uri)?.[1] ?? "jpg";
    const kept = new File(folder, `${newId()}.${extension}`);
    await new File(photo.uri).copy(kept);
    return { ...photo, uri: kept.uri };
  } catch {
    // Not copied: the upload still works while the original file is there.
    return photo;
  }
}

async function uploadPhoto(payload: { id: string; photo: PickedPhoto }) {
  const { id, photo } = payload;
  const type = photo.mimeType || "image/jpeg";
  const name = photo.fileName || `item-${id}.jpg`;
  const form = new FormData();
  if (Platform.OS === "web") {
    // Web pickers hand back a blob:/data: URI; send the bytes themselves.
    const blob = await (await fetch(photo.uri)).blob();
    form.append("image", blob, name);
  } else {
    const file = new File(photo.uri);
    // The file is gone (cleared by the phone): nothing to upload any more.
    if (!file.exists) throw new ApiError("Photo is no longer on this phone", "IMAGE_REQUIRED", 400);
    // Expo's fetch can't stream React Native's {uri} parts, but takes any
    // part with name, type and bytes(); read them straight from the file.
    form.append("image", {
      name,
      type,
      bytes: async () => new Uint8Array(await file.arrayBuffer()),
    } as unknown as Blob);
  }
  try {
    return await api.upload<ItemResponse>(`/items/${id}/image`, form);
  } catch (error) {
    // Photos have their own queue. The item itself may still be on its way in
    // the main one: "not found" then only means "not yet", so try again soon.
    const adding = pendingEntries().some(
      (entry) =>
        entry.kind === addChange.name && (entry.payload as { body: AddBody }).body.id === id,
    );
    if (adding && isAlreadyGone(error)) {
      throw new ApiError("The item is still being saved", "ITEM_NOT_READY", 503);
    }
    throw error;
  }
}

const photoChange = defineChange<{ id: string; photo: PickedPhoto }, ItemResponse>(
  "item.photo",
  uploadPhoto,
  {
    // Uploads are slow: they must not hold up ticking and adding.
    lane: "photos",
    // Uploaded (or refused) after waiting: the row stops showing "uploading".
    afterWaiting: (payload) =>
      changeHolding([payload.id], (items) =>
        items.map((item) =>
          item.id === payload.id ? { ...item, photoUploading: false } : item,
        ),
      ),
  },
);

const photoRemoveChange = defineChange<{ id: string }, ItemResponse>("item.photoRemove", (payload) =>
  api.delete<ItemResponse>(`/items/${payload.id}/image`),
);

/** Attach or replace an item's photo. The server resizes it. */
export async function uploadItemImage(itemId: string, photo: PickedPhoto) {
  const label = labelFor("photo", [itemId]);
  const previous = findItem(itemId)?.item;
  const kept = await keepPhoto(photo);
  changeHolding([itemId], (items) =>
    items.map((item) =>
      item.id === itemId ? { ...item, localImageUri: kept.uri, photoUploading: true } : item,
    ),
  );
  const result = await perform(photoChange, { id: itemId, photo: kept }, label);
  if (result.error) {
    changeHolding([itemId], (items) =>
      items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              imageId: previous?.imageId ?? null,
              localImageUri: undefined,
              photoUploading: false,
            }
          : item,
      ),
    );
    return { item: null as Purchase | null, error: result.error, queued: false };
  }
  if (!result.data) return { item: null as Purchase | null, error: null, queued: true };
  const saved = toPurchase(result.data);
  // Keep showing the local file while it is the same photo the server has
  // (see keepLocalPhotos), so the thumbnail doesn't blink after upload.
  changeHolding([itemId], (items) =>
    items.map((item) =>
      item.id === itemId ? { ...item, imageId: saved.imageId ?? null, photoUploading: false } : item,
    ),
  );
  return { item: saved, error: null, queued: false };
}

export async function removeItemImage(itemId: string) {
  const label = labelFor("photo", [itemId]);
  const previous = findItem(itemId)?.item;
  changeHolding([itemId], (items) =>
    items.map((item) =>
      item.id === itemId
        ? { ...item, imageId: null, localImageUri: undefined, photoUploading: false }
        : item,
    ),
  );
  const result = await perform(photoRemoveChange, { id: itemId }, label);
  if (result.error) {
    changeHolding([itemId], (items) =>
      items.map((item) =>
        item.id === itemId ? { ...item, imageId: previous?.imageId ?? null } : item,
      ),
    );
    return { item: null as Purchase | null, error: result.error, queued: false };
  }
  return {
    item: result.data ? toPurchase(result.data) : null,
    error: null,
    queued: result.queued,
  };
}

/**
 * Run once when the app starts. A local photo only matters while its upload
 * waits: rows saved with one from an earlier run go back to the server's
 * photo, and copies no upload needs any more are deleted.
 */
function tidyKeptPhotos() {
  const waiting = new Map<string, string>();
  for (const entry of pendingEntries()) {
    if (entry.kind !== photoChange.name) continue;
    const payload = entry.payload as { id: string; photo: PickedPhoto };
    waiting.set(payload.id, payload.photo.uri);
  }
  for (const home of savedHomes()) {
    if (!home.items.some((item) => item.localImageUri || item.photoUploading)) continue;
    changeHome(home.homeId, (items) =>
      items.map((item) => {
        if (!item.localImageUri && !item.photoUploading) return item;
        const uri = waiting.get(item.id);
        if (uri) return { ...item, localImageUri: uri, photoUploading: true };
        const { localImageUri: _local, photoUploading: _busy, ...rest } = item;
        return rest;
      }),
    );
  }
  if (Platform.OS === "web") return;
  try {
    const folder = new Directory(Paths.document, KEPT_PHOTOS);
    if (!folder.exists) return;
    const needed = new Set(waiting.values());
    for (const entry of folder.list()) {
      if (entry instanceof File && !needed.has(entry.uri)) entry.delete();
    }
  } catch {
    // Left for the next start.
  }
}

tidyKeptPhotos();
