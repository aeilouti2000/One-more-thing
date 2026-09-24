import { translate } from "@/constants/i18n";
import { formatAppError, logError } from "@/lib/errors";
import { requireUser } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import type { ItemCategory, ItemRow, ProfileRow } from "@/types/database";
import type { Purchase } from "@/types/purchase";

export type NewItemInput = {
  homeId: string;
  userId: string;
  name: string;
  quantity: number;
  category: ItemCategory;
  notes?: string;
  unit?: string;
};

export type UpdateItemInput = Pick<
  NewItemInput,
  "name" | "quantity" | "category"
>;

function uniqueIds(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function toPurchase(row: ItemRow, names: Map<string, string>): Purchase {
  const quantity = Number(row.quantity);

  return {
    id: row.id,
    name: row.name,
    quantity: Number.isFinite(quantity) ? quantity : 1,
    unit: row.unit ?? undefined,
    category: row.category,
    notes: row.notes ?? undefined,
    status: row.status,
    addedByName: names.get(row.added_by) ?? translate("member"),
    boughtByName: row.bought_by ? names.get(row.bought_by) : undefined,
    createdAt: row.created_at,
    boughtAt: row.bought_at ?? undefined,
  };
}

async function namesForRows(rows: ItemRow[]) {
  const names = new Map<string, string>();
  const profileIds = uniqueIds(rows.flatMap((row) => [row.added_by, row.bought_by]));
  if (profileIds.length === 0) {
    return names;
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, name")
    .in("id", profileIds);

  for (const profile of (profiles ?? []) as Pick<ProfileRow, "id" | "name">[]) {
    names.set(profile.id, profile.name);
  }

  return names;
}

export async function fetchHomeItems(homeId: string) {
  const listed = await supabase.rpc("list_home_items");
  if (!listed.error) {
    const rows = ((listed.data ?? []) as ItemRow[]).filter(
      (row) => row.home_id === homeId,
    );
    const names = await namesForRows(rows);
    return {
      items: rows.map((row) => toPurchase(row, names)),
      error: null,
    };
  }

  const { data, error } = await supabase
    .from("items")
    .select(
      "id, home_id, name, quantity, unit, category, notes, status, added_by, bought_by, created_at, bought_at",
    )
    .eq("home_id", homeId)
    .order("created_at", { ascending: false });

  if (error) {
    logError("fetch_items", error);
    return { items: [] as Purchase[], error: formatAppError(error) };
  }

  const rows = (data ?? []) as ItemRow[];
  const names = await namesForRows(rows);
  return {
    items: rows.map((row) => toPurchase(row, names)),
    error: null,
  };
}

export async function addItem(input: NewItemInput) {
  const { user, error: userError } = await requireUser();
  if (!user) {
    return { error: userError };
  }

  const rpc = await supabase.rpc("add_item", {
    p_home_id: input.homeId,
    p_name: input.name.trim(),
    p_quantity: input.quantity,
    p_category: input.category,
    p_notes: input.notes?.trim() || null,
    p_unit: input.unit?.trim() || null,
  });

  if (!rpc.error) {
    return { error: null };
  }

  logError("add_item", rpc.error);

  const { error } = await supabase.from("items").insert({
    home_id: input.homeId,
    name: input.name.trim(),
    quantity: input.quantity,
    unit: input.unit?.trim() || null,
    category: input.category,
    notes: input.notes?.trim() || null,
    status: "needed",
    added_by: user.id,
  });

  if (error) {
    logError("add_item_insert", error);
    return { error: formatAppError(error) };
  }

  return { error: null };
}

export async function updateItemDetails(
  itemId: string,
  input: UpdateItemInput,
) {
  const { user, error: userError } = await requireUser();
  if (!user) {
    return { error: userError };
  }

  const { error } = await supabase
    .from("items")
    .update({
      name: input.name.trim(),
      quantity: input.quantity,
      category: input.category,
    })
    .eq("id", itemId);

  if (error) {
    logError("update_item_details", error);
    return { error: formatAppError(error) };
  }

  return { error: null };
}

export async function markItemBought(itemId: string) {
  const rpc = await supabase.rpc("mark_item_bought", { p_item_id: itemId });
  if (!rpc.error) {
    return { error: null };
  }

  logError("mark_bought", rpc.error);

  const { user, error: userError } = await requireUser();
  if (!user) {
    return { error: userError };
  }

  const { error } = await supabase
    .from("items")
    .update({
      status: "bought",
      bought_by: user.id,
      bought_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (error) {
    logError("mark_bought_update", error);
    return { error: formatAppError(error) };
  }

  return { error: null };
}

export async function markItemsBought(itemIds: string[]) {
  if (itemIds.length === 0) {
    return { error: null };
  }

  const { user, error: userError } = await requireUser();
  if (!user) {
    return { error: userError };
  }

  const { error } = await supabase
    .from("items")
    .update({
      status: "bought",
      bought_by: user.id,
      bought_at: new Date().toISOString(),
    })
    .in("id", itemIds)
    .eq("status", "needed");

  if (error) {
    logError("mark_items_bought", error);
    return { error: formatAppError(error) };
  }

  return { error: null };
}

export async function deleteItems(itemIds: string[]) {
  if (itemIds.length === 0) {
    return { error: null };
  }

  const { error } = await supabase.from("items").delete().in("id", itemIds);

  if (error) {
    logError("delete_items", error);
    return { error: formatAppError(error) };
  }

  return { error: null };
}
