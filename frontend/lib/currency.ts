const CURRENCY_META: Record<string, { symbol: string; decimals: number }> = {
  JOD: { symbol: "JD", decimals: 3 },
  USD: { symbol: "$", decimals: 2 },
  EUR: { symbol: "€", decimals: 2 },
  ILS: { symbol: "₪", decimals: 2 },
  SAR: { symbol: "SAR", decimals: 2 },
  AED: { symbol: "AED", decimals: 2 },
  EGP: { symbol: "EGP", decimals: 2 },
  GBP: { symbol: "£", decimals: 2 },
};

export function currencySymbol(code: string | undefined | null) {
  const key = (code ?? "JOD").toUpperCase();
  return CURRENCY_META[key]?.symbol ?? key;
}

export function currencyDecimals(code: string | undefined | null) {
  const key = (code ?? "JOD").toUpperCase();
  return CURRENCY_META[key]?.decimals ?? 2;
}

export function formatMoney(
  amount: number | null | undefined,
  currency: string | undefined | null,
  emptyLabel = "—",
) {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return emptyLabel;
  }
  const decimals = currencyDecimals(currency);
  const symbol = currencySymbol(currency);
  return `${symbol} ${amount.toFixed(decimals)}`;
}

export function parseCostInput(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return NaN;
  return Math.round(value * 1000) / 1000;
}

export function sumKnownCosts(costs: Array<number | null | undefined>) {
  let total = 0;
  let priced = 0;
  for (const cost of costs) {
    if (cost === null || cost === undefined || !Number.isFinite(cost)) continue;
    total += cost;
    priced += 1;
  }
  return { total, priced, count: costs.length };
}
