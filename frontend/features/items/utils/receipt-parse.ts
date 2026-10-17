const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

const TOTAL =
  /(total|grand|amount due|balance due|net amount|المجموع|الاجمالي|الإجمالي|الاجمالى|الصافي|المطلوب)/i;
const SUBTOTAL = /(subtotal|sub total|المجموع الفرعي)/i;
const SKIP = /(vat|tax|gst|discount|ضريب|خصم|visa|mastercard|cash|نقد|بطاقة|thank|شكر)/i;

export type ReceiptLine = {
  id: string;
  name: string;
  amount: number;
  qty: number | null;
};

export function normalizeDigits(raw: string) {
  let out = "";
  for (const char of raw) {
    const arabic = ARABIC_DIGITS.indexOf(char);
    if (arabic >= 0) {
      out += String(arabic);
      continue;
    }
    const persian = PERSIAN_DIGITS.indexOf(char);
    if (persian >= 0) {
      out += String(persian);
      continue;
    }
    if (char === "\u066B") {
      out += ".";
      continue;
    }
    if (char === "\u066C") continue;
    out += char;
  }
  return out;
}

function parseAmount(token: string): number | null {
  const normalized = token.replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  const hasDecimal = token.includes(".") || token.includes(",");
  if (!hasDecimal) {
    if (token.length >= 7) return null;
    const year = Number(token);
    if (token.length === 4 && year >= 2000 && year <= 2099) return null;
  }
  return Math.round(value * 1000) / 1000;
}

function lastAmount(line: string): { amount: number; token: string } | null {
  const matches = line.matchAll(/\d{1,7}(?:[.,]\d{1,3})?/g);
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

function cleanName(line: string, token: string) {
  const index = line.lastIndexOf(token);
  const head = (index >= 0 ? line.slice(0, index) : line).replace(/[\s.:*\-]+$/g, "").trim();
  return head.replace(/^(?:\d{1,2}\s*[x×]|[x×]\s*\d{1,2})\s+/i, "").trim();
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
  };
  const drafts: Draft[] = [];

  for (const line of rawLines) {
    const found = lastAmount(line);
    if (!found) continue;
    const name = cleanName(line, found.token);
    const blob = `${name} ${line}`;
    let kind: Draft["kind"] = "item";
    if (SUBTOTAL.test(blob)) kind = "subtotal";
    else if (TOTAL.test(blob)) kind = "total";
    else if (SKIP.test(blob) || name.length === 0) kind = "skip";
    drafts.push({ name, amount: found.amount, qty: readQty(line), kind });
  }

  let total: number | null = null;
  const totals = drafts.filter((draft) => draft.kind === "total");
  if (totals.length > 0) {
    total = totals[totals.length - 1]?.amount ?? null;
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
