import { Repository } from "typeorm";
import { Item } from "../entities/item.entity";

export async function placeNeededItem(
  items: Repository<Item>,
  homeId: string,
  itemId: string,
  slot: "top" | "after-urgent",
  listId?: string,
) {
  const rows = await neededRows(items, homeId, listId);
  const current = rows.find((row) => row.id === itemId);
  if (!current) return;
  const rest = rows.filter((row) => row.id !== itemId);
  const ordered = slot === "top" ? [current, ...rest] : insertAfterUrgent(rest, current);
  await writeOrder(items, ordered.map((row) => row.id));
}

export async function applyNeededOrder(items: Repository<Item>, homeId: string, ids: string[]) {
  const rows = await neededRows(items, homeId);
  const known = new Set(rows.map((row) => row.id));
  if (new Set(ids).size !== ids.length || ids.some((id) => !known.has(id))) {
    return false;
  }

  const moving = new Set(ids);
  const queue = [...ids];
  const next = rows.map((row) => (moving.has(row.id) ? queue.shift()! : row.id));
  await writeOrder(items, next);
  return true;
}

function neededRows(items: Repository<Item>, homeId: string, listId?: string) {
  return items.find({
    where: { homeId, status: "needed", ...(listId ? { listId } : {}) },
    order: { sortOrder: "ASC", createdAt: "DESC" },
  });
}

function insertAfterUrgent(rest: Item[], item: Item) {
  const index = rest.findIndex((row) => !row.urgent);
  if (index === -1) return [...rest, item];
  return [...rest.slice(0, index), item, ...rest.slice(index)];
}

function writeOrder(items: Repository<Item>, ids: string[]) {
  if (ids.length === 0) return Promise.resolve();
  const cases = ids.map((_, index) => `WHEN $${index + 1}::uuid THEN ${index}`).join(" ");
  const inList = ids.map((_, index) => `$${index + 1}::uuid`).join(", ");
  return items.query(
    `UPDATE items SET sort_order = CASE id ${cases} ELSE sort_order END WHERE id IN (${inList})`,
    ids,
  );
}
