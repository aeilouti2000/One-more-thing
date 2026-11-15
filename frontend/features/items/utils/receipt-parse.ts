import { normalizeDigits } from "@/lib/numbers";

const TOTAL =
  /(total|grand|amount due|balance due|net amount|المجموع|الاجمالي|الإجمالي|الاجمالى|الصافي|المطلوب)/i;
const SUBTOTAL = /(subtotal|sub total|المجموع الفرعي)/i;
const SKIP =
  /(vat|tax|gst|discount|ضريب|خصم|visa|mastercard|cash|نقد|بطاقة|thank|شكر|change|الباقي|المتبقي|\bitems\b|عدد|invoice|receipt|فاتورة|\btel\b|phone|هاتف|تلفون|cashier|كاشير)/i;
/** A date (12/05/2026, 2026-05-12) or a time (14:32): never a price. */
const DATE_OR_TIME = /\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b|\b\d{1,2}:\d{2}\b/;
/** "1,234.50": the comma groups thousands only when a decimal point follows. */
const GROUPED = /^\d{1,3}(?:,\d{3})+\.\d{1,3}$/;

export type ReceiptLine = {
  id: string;
  name: string;
  amount: number;
  qty: number | null;
};

function parseAmount(token: string): number | null {
  const normalized = GROUPED.test(token) ? token.replace(/,/g, "") : token.replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  const hasDecimal = token.includes(".") || token.includes(",");
  if (!hasDecimal) {
    // Barcodes, and numbers written with leading zeros (invoice 00123, phone 06…).
    if (token.length >= 7 || (token.length > 1 && token.startsWith("0"))) return null;
    const year = Number(token);
    if (token.length === 4 && year >= 2000 && year <= 2099) return null;
  }
  return Math.round(value * 1000) / 1000;
}

function lastAmount(line: string): { amount: number; token: string } | null {
  const matches = line.matchAll(/\d{1,3}(?:,\d{3})+\.\d{1,3}|\d{1,7}(?:[.,]\d{1,3})?/g);
  const found = [...matches];
  for (let index = found.length - 1; index >= 0; index -= 1) {
    const token = found[index]?.[0];
    if (!token) continue;
    const amount = parseAmount(token);
    if (amount === null) continue;
    return { amount, token };
  }
  return null;
}

function readQty(name: string): number | null {
  const match = name.match(/(?:^|\s)(\d{1,2})\s*[x×]|[x×]\s*(\d{1,2})(?:\s|$)/i);
  if (!match) return null;
  const qty = Number(match[1] ?? match[2]);
  if (!Number.isFinite(qty) || qty <= 0 || qty >= 100) return null;
  return qty;
}

const LETTER = /[A-Za-z\u0600-\u06FF]/;
const CURRENCY = /^(?:jd|jod|sar|aed|usd|eur|ils|egp|gbp)$/i;

function nameAroundAmount(line: string, token: string) {
  const index = line.lastIndexOf(token);
  const before = line.slice(0, index).replace(/[\s.:*\-–—]+$/g, "").trim();
  const after = line.slice(index + token.length).replace(/^[\s.:*\-–—]+/g, "").trim();
  const chosen = LETTER.test(before) ? before : LETTER.test(after) ? after : "";
  const stripped = chosen.replace(/^(?:\d{1,2}\s*[x×]|[x×]\s*\d{1,2})\s+/i, "").trim();
  if (!stripped || CURRENCY.test(stripped)) return "";
  return stripped;
}

export function parseReceiptText(text: string): { lines: ReceiptLine[]; total: number | null } {
  const rawLines = normalizeDigits(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  type Draft = {
    name: string;
    amount: number;
    qty: number | null;
    kind: "item" | "total" | "subtotal" | "skip";
    /** Written with a decimal mark, like money usually is. */
    decimal: boolean;
  };
  const drafts: Draft[] = [];
  let pendingName = "";

  for (const line of rawLines) {
    if (DATE_OR_TIME.test(line)) continue;
    const found = lastAmount(line);
    if (!found) {
      if (
        LETTER.test(line) &&
        line.length <= 80 &&
        !TOTAL.test(line) &&
        !SUBTOTAL.test(line) &&
        !SKIP.test(line)
      ) {
        pendingName = line.trim();
      }
      continue;
    }
    let name = nameAroundAmount(line, found.token);
    if (!name && pendingName) name = pendingName;
    pendingName = "";
    const blob = `${name} ${line}`;
    let kind: Draft["kind"] = "item";
    if (SUBTOTAL.test(blob)) kind = "subtotal";
    else if (TOTAL.test(blob)) kind = "total";
    else if (SKIP.test(blob)) kind = "skip";
    drafts.push({
      name,
      amount: found.amount,
      qty: readQty(line),
      kind,
      decimal: /[.,]/.test(found.token),
    });
  }

  let total: number | null = null;
  const totals = drafts.filter((draft) => draft.kind === "total");
  if (totals.length > 0) {
    // The largest one: a "Total VAT" line is never above the grand total. A
    // whole number ("Total items 12") only counts when no total has decimals.
    const money = totals.filter((draft) => draft.decimal);
    total = Math.max(...(money.length > 0 ? money : totals).map((draft) => draft.amount));
  } else {
    const subs = drafts.filter((draft) => draft.kind === "subtotal");
    if (subs.length > 0) total = subs[subs.length - 1]?.amount ?? null;
  }

  const items = drafts.filter((draft) => draft.kind === "item");
  if (total === null && items.length >= 2) {
    const last = items[items.length - 1];
    const before = items.slice(0, -1).reduce((sum, item) => sum + item.amount, 0);
    const bare = !last || last.name.length === 0 || /^(jd|sar|aed|usd|eur|ils|egp|gbp)$/i.test(last.name);
    if (last && bare && last.amount + 0.001 >= before) {
      total = last.amount;
      items.pop();
    }
  }

  return {
    total,
    lines: items.map((item, index) => ({
      id: `r${index}`,
      name: item.name,
      amount: item.amount,
      qty: item.qty,
    })),
  };
}
