const DIACRITICS = /[\u064B-\u0652\u0670\u0640]/g;
const SIZE = /\b\d+(?:[.,]\d+)?\s?(?:ml|l|g|kg|oz|lb|pcs?|pc)\b/gi;

export function normalizeItemName(raw: string) {
  return raw
    .toLowerCase()
    .replace(DIACRITICS, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(SIZE, " ")
    .replace(/[^\u0600-\u06FFa-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string) {
  return value.split(" ").filter((token) => token.length > 1);
}

export function nameScore(listName: string, receiptName: string) {
  const left = normalizeItemName(listName);
  const right = normalizeItemName(receiptName);
  if (!left || !right) return 0;
  const listTokens = tokens(left);
  const receiptTokens = tokens(right);
  if (listTokens.length === 0 || receiptTokens.length === 0) return 0;
  const listSet = new Set(listTokens);
  const receiptSet = new Set(receiptTokens);
  let hits = 0;
  for (const token of listTokens) {
    if (receiptSet.has(token)) hits += 1;
  }
  const overlap = hits / Math.max(listTokens.length, receiptTokens.length);
  const shorter = listTokens.length <= receiptTokens.length ? listTokens : receiptTokens;
  const longer = listTokens.length <= receiptTokens.length ? receiptSet : listSet;
  const contained = shorter.every((token) => longer.has(token));
  if (contained) return Math.max(overlap, 0.8);
  return overlap;
}

export type ReceiptMatchLine = {
  id: string;
  name: string;
  qty: number | null;
};

export function matchReceiptLines(
  items: { id: string; name: string; quantity?: number }[],
  lines: ReceiptMatchLine[],
) {
  const pairs: { itemId: string; lineId: string; score: number }[] = [];
  for (const item of items) {
    for (const line of lines) {
      let score = nameScore(item.name, line.name);
      if (
        item.quantity &&
        line.qty &&
        item.quantity === line.qty &&
        score > 0
      ) {
        score += 0.08;
      }
      if (score >= 0.62) {
        pairs.push({ itemId: item.id, lineId: line.id, score });
      }
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  const usedItems = new Set<string>();
  const usedLines = new Set<string>();
  const matches: { itemId: string; lineId: string }[] = [];
  for (const pair of pairs) {
    if (usedItems.has(pair.itemId) || usedLines.has(pair.lineId)) continue;
    usedItems.add(pair.itemId);
    usedLines.add(pair.lineId);
    matches.push({ itemId: pair.itemId, lineId: pair.lineId });
  }
  return matches;
}
