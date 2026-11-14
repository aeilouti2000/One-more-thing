const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** Arabic and Persian digits (and the Arabic decimal mark) as their Western forms. */
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
    if (char === "٫") {
      out += ".";
      continue;
    }
    // Arabic thousands mark.
    if (char === "٬") continue;
    out += char;
  }
  return out;
}

/**
 * A plain, non-negative decimal as typed on any keypad: Western, Arabic or
 * Persian digits, with "." or "," as the decimal mark. NaN for anything else
 * (signs, exponents, thousands groups, empty text).
 */
export function parseDecimal(raw: string): number {
  const text = normalizeDigits(raw).trim().replace(",", ".");
  if (!/^(\d+\.?\d*|\.\d+)$/.test(text)) return NaN;
  return Number(text);
}
