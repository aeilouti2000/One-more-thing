import { invoiceAnchors, monthOf } from "@/features/items/utils/trips";
import type { Purchase } from "@/features/items/types/purchase";

/** Names compare without case, extra spaces, or Arabic diacritics. */
export function normalizeName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/\s+/g, " ");
}

function boughtMs(item: Purchase) {
  const ms = new Date(item.boughtAt ?? item.createdAt).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function hasCost(item: Purchase): item is Purchase & { cost: number } {
  return typeof item.cost === "number" && Number.isFinite(item.cost);
}

/** Plain pieces (no unit) and packs are counted; kg, ml and custom units are not. */
export function isCountableUnit(unit: string | null | undefined) {
  const key = (unit ?? "").trim().toLowerCase();
  return key === "" || key === "pack";
}

function sameUnit(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

function roundMoney(value: number) {
  return Math.round(value * 1000) / 1000;
}

/** A priced purchase: what was paid for the whole line, and how much of it. */
export type PricedLine = { cost: number; quantity: number; unit?: string | null };
export type PriceTarget = { quantity: number; unit?: string | null };

/**
 * What a remembered purchase suggests for a new line. Counted units (pieces,
 * packs) go by the price of one, so 3 for JD 3 suggests JD 5 for 5. Anything
 * measured (kg, ml, custom units) keeps the whole price it was bought at.
 * `each` is the price of one when it was used, else null.
 */
export function priceFor(last: PricedLine, target?: PriceTarget): { cost: number; each: number | null } {
  const scales =
    target !== undefined &&
    isCountableUnit(last.unit) &&
    sameUnit(last.unit, target.unit) &&
    last.quantity > 0 &&
    target.quantity > 0;
  if (!scales) return { cost: last.cost, each: null };
  const each = last.cost / last.quantity;
  return {
    cost: target.quantity === last.quantity ? last.cost : roundMoney(each * target.quantity),
    each: roundMoney(each),
  };
}

/** Does the name match what was typed, at the start of any word first. */
export function matchRank(name: string, query: string) {
  const text = normalizeName(name);
  const q = normalizeName(query);
  if (!q) return 0;
  if (text.startsWith(q)) return 3;
  if (text.split(" ").some((word) => word.startsWith(q))) return 2;
  return text.includes(q) ? 1 : 0;
}

export type ItemSuggestion = {
  name: string;
  category: string;
  unit?: string;
  /** What it cost the last time a price was entered: for one piece or pack, else the whole line. */
  lastCost: number | null;
  lastBoughtAt: string;
};

/**
 * Things bought before whose name matches what's being typed, newest first.
 * Names already waiting on the list are left out: they show in the list itself.
 */
export function suggestItems(
  purchases: Purchase[],
  query: string,
  options?: { exclude?: Iterable<string>; limit?: number },
): ItemSuggestion[] {
  const q = normalizeName(query);
  if (!q) return [];
  const excluded = new Set([...(options?.exclude ?? [])].map(normalizeName));
  const byName = new Map<string, { item: Purchase; rank: number; cost: number | null; costAt: number }>();

  for (const item of purchases) {
    if (item.status !== "bought") continue;
    const key = normalizeName(item.name);
    if (!key || excluded.has(key)) continue;
    const rank = matchRank(item.name, q);
    if (rank === 0) continue;
    const at = boughtMs(item);
    const current = byName.get(key);
    const entry = current ?? { item, rank, cost: null, costAt: -1 };
    if (at > boughtMs(entry.item)) entry.item = item;
    if (hasCost(item) && at > entry.costAt) {
      // Picking a suggestion adds one, so show the price of one.
      entry.cost = priceFor(item, { quantity: 1, unit: item.unit }).cost;
      entry.costAt = at;
    }
    byName.set(key, entry);
  }

  return [...byName.values()]
    .sort((a, b) => b.rank - a.rank || boughtMs(b.item) - boughtMs(a.item))
    .slice(0, options?.limit ?? 4)
    .map(({ item, cost }) => ({
      name: item.name.trim(),
      category: item.category,
      unit: item.unit,
      lastCost: cost,
      lastBoughtAt: item.boughtAt ?? item.createdAt,
    }));
}

/**
 * What this item cost the last time it was bought with a price. With a target
 * line, pieces and packs are priced for its quantity (see priceFor).
 */
export function lastPrice(
  purchases: Purchase[],
  name: string,
  excludeId?: string,
  target?: PriceTarget,
): { cost: number; each: number | null; boughtAt: string } | null {
  const key = normalizeName(name);
  if (!key) return null;
  let best: (Purchase & { cost: number }) | null = null;
  for (const item of purchases) {
    if (item.status !== "bought" || item.id === excludeId || !hasCost(item)) continue;
    if (item.cost <= 0 || normalizeName(item.name) !== key) continue;
    if (!best || boughtMs(item) > boughtMs(best)) best = item;
  }
  return best ? { ...priceFor(best, target), boughtAt: best.boughtAt ?? best.createdAt } : null;
}

/** Bought items of one calendar month ("2026-11"); an invoice stays whole. */
export function boughtInMonth(purchases: Purchase[], month: string) {
  const bought = purchases.filter((item) => item.status === "bought");
  const anchors = invoiceAnchors(bought);
  return bought.filter((item) => {
    const at = (item.receiptId ? anchors.get(item.receiptId) : null) ?? item;
    return monthOf(at.boughtAt ?? at.createdAt) === month;
  });
}

/** Category key for the part of a trip total that isn't priced per item. */
export const TRIP_TOTALS = "__trip_totals__";

export type MonthSummary = {
  month: string;
  total: number;
  /** Items in the month, and how many have no price at all. */
  count: number;
  unpriced: number;
  byCategory: { category: string; total: number }[];
};

/**
 * Spending for one month. The total matches History: an invoice with a total
 * counts that total once; everything else counts each item's own price.
 */
export function summarizeMonth(purchases: Purchase[], month: string): MonthSummary {
  const items = boughtInMonth(purchases, month);
  const categories = new Map<string, number>();
  const add = (category: string, amount: number) =>
    categories.set(category, (categories.get(category) ?? 0) + amount);

  const receipts = new Map<string, Purchase[]>();
  let total = 0;
  let unpriced = 0;

  for (const item of items) {
    const invoiceTotal = item.receiptTotal;
    if (item.receiptId && typeof invoiceTotal === "number" && Number.isFinite(invoiceTotal)) {
      const bucket = receipts.get(item.receiptId) ?? [];
      bucket.push(item);
      receipts.set(item.receiptId, bucket);
      continue;
    }
    if (hasCost(item)) {
      total += item.cost;
      add(item.category, item.cost);
    } else {
      unpriced += 1;
    }
  }

  for (const bucket of receipts.values()) {
    const invoiceTotal = bucket[0].receiptTotal as number;
    let itemised = 0;
    for (const item of bucket) {
      if (!hasCost(item)) continue;
      itemised += item.cost;
      add(item.category, item.cost);
    }
    total += invoiceTotal;
    // The rest of the invoice was entered as one amount, not per item.
    const rest = invoiceTotal - itemised;
    if (rest > 0.0005) add(TRIP_TOTALS, rest);
  }

  return {
    month,
    total,
    count: items.length,
    unpriced,
    byCategory: [...categories.entries()]
      .filter(([, amount]) => amount > 0)
      .map(([category, amount]) => ({ category, total: amount }))
      .sort((a, b) => b.total - a.total),
  };
}

/** "2026-11" → "2026-10". */
export function previousMonth(month: string) {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(year, index - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function currentMonth(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function csvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // A leading = + - @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(text) && typeof value !== "number" ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export type CsvLabels = {
  date: string;
  item: string;
  quantity: string;
  unit: string;
  category: string;
  list: string;
  boughtBy: string;
  price: string;
  invoice: string;
  invoiceTotal: string;
  total: string;
};

/** Purchases as a spreadsheet file (CSV), oldest first, with a total row. */
export function purchasesToCsv(
  items: Purchase[],
  labels: CsvLabels,
  categoryLabel: (category: string) => string,
  total: number,
) {
  const rows: (string | number | null | undefined)[][] = [
    [
      labels.date,
      labels.item,
      labels.quantity,
      labels.unit,
      labels.category,
      labels.list,
      labels.boughtBy,
      labels.price,
      labels.invoice,
      labels.invoiceTotal,
    ],
  ];
  const ordered = [...items].sort((a, b) => boughtMs(a) - boughtMs(b));
  const seenInvoices = new Set<string>();
  for (const item of ordered) {
    const at = new Date(item.boughtAt ?? item.createdAt);
    const day = Number.isNaN(at.getTime())
      ? ""
      : `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
    // An invoice total is written once, on its first row, so a column sum is right.
    const firstOfInvoice = item.receiptId ? !seenInvoices.has(item.receiptId) : false;
    if (item.receiptId) seenInvoices.add(item.receiptId);
    rows.push([
      day,
      item.name,
      item.quantity,
      item.unit ?? "",
      categoryLabel(item.category),
      item.listName ?? "",
      item.boughtByName ?? "",
      hasCost(item) ? item.cost : "",
      item.receiptId ? (item.receiptName ?? "") || item.receiptId.slice(0, 8) : "",
      firstOfInvoice && typeof item.receiptTotal === "number" ? item.receiptTotal : "",
    ]);
  }
  rows.push([labels.total, "", "", "", "", "", "", Math.round(total * 1000) / 1000, "", ""]);
  // The BOM makes Excel read Arabic text correctly.
  return `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
