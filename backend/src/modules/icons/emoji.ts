/**
 * Exactly one emoji: one visible character (a "grapheme", so 👨‍👩‍👧 or 🇯🇴
 * counts as one) that is a pictograph or a flag, at most 32 bytes.
 * The app checks the same list of inputs (emoji.cases.json).
 */
export function isSingleEmoji(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  if (Buffer.byteLength(value, "utf8") > 32) return false;
  const graphemes = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(value)];
  if (graphemes.length !== 1) return false;
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value);
}
