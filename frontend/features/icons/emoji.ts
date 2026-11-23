/**
 * Exactly one emoji, by the server rule (backend/src/modules/icons/emoji.ts):
 * one visible character (a "grapheme", so 👨‍👩‍👧 or 🇯🇴 counts as one) that is a
 * pictograph or a flag, at most 32 bytes. Both test suites read one list of
 * inputs (emoji.cases.json).
 *
 * The phone may lack Intl.Segmenter and regex Unicode properties (Hermes), so
 * the pictograph table is written out here (Unicode Extended_Pictographic) and
 * graphemes are counted with the rules that matter for emoji when there is no
 * Segmenter.
 */
const PICTOGRAPHIC_RANGES: [number, number][] = [
  "a9,ae,203c,2049,2122,2139,2194-2199,21a9-21aa,231a-231b,2328,23cf,23e9-23f3,23f8-23fa,24c2",
  "25aa-25ab,25b6,25c0,25fb-25fe,2600-2604,260e,2611,2614-2615,2618,261d,2620,2622-2623,2626",
  "262a,262e-262f,2638-263a,2640,2642,2648-2653,265f-2660,2663,2665-2666,2668,267b,267e-267f",
  "2692-2697,2699,269b-269c,26a0-26a1,26a7,26aa-26ab,26b0-26b1,26bd-26be,26c4-26c5,26c8",
  "26ce-26cf,26d1,26d3-26d4,26e9-26ea,26f0-26f5,26f7-26fa,26fd,2702,2705,2708-270d,270f,2712",
  "2714,2716,271d,2721,2728,2733-2734,2744,2747,274c,274e,2753-2755,2757,2763-2764,2795-2797",
  "27a1,27b0,27bf,2934-2935,2b05-2b07,2b1b-2b1c,2b50,2b55,3030,303d,3297,3299,1f004",
  "1f02c-1f02f,1f094-1f09f,1f0af-1f0b0,1f0c0,1f0cf-1f0d0,1f0f6-1f0ff,1f170-1f171,1f17e-1f17f",
  "1f18e,1f191-1f19a,1f1ae-1f1e5,1f201-1f20f,1f21a,1f22f,1f232-1f23a,1f23c-1f23f,1f249-1f25f",
  "1f266-1f321,1f324-1f393,1f396-1f397,1f399-1f39b,1f39e-1f3f0,1f3f3-1f3f5,1f3f7-1f3fa",
  "1f400-1f4fd,1f4ff-1f53d,1f549-1f54e,1f550-1f567,1f56f-1f570,1f573-1f57a,1f587,1f58a-1f58d",
  "1f590,1f595-1f596,1f5a4-1f5a5,1f5a8,1f5b1-1f5b2,1f5bc,1f5c2-1f5c4,1f5d1-1f5d3,1f5dc-1f5de",
  "1f5e1,1f5e3,1f5e8,1f5ef,1f5f3,1f5fa-1f64f,1f680-1f6c5,1f6cb-1f6d2,1f6d5-1f6e5,1f6e9",
  "1f6eb-1f6f0,1f6f3-1f6ff,1f7da-1f7ff,1f80c-1f80f,1f848-1f84f,1f85a-1f85f,1f888-1f88f",
  "1f8ae-1f8af,1f8bc-1f8bf,1f8c2-1f8cf,1f8d9-1f8ff,1f90c-1f93a,1f93c-1f945,1f947-1f9ff",
  "1fa58-1fa5f,1fa6e-1faff,1fc00-1fffd",
]
  .join(",")
  .split(",")
  .map((part) => {
    const [from, to] = part.split("-").map((hex) => parseInt(hex, 16));
    return [from, to ?? from] as [number, number];
  });

export function isPictographic(codePoint: number) {
  let low = 0;
  let high = PICTOGRAPHIC_RANGES.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const [from, to] = PICTOGRAPHIC_RANGES[middle];
    if (codePoint < from) high = middle - 1;
    else if (codePoint > to) low = middle + 1;
    else return true;
  }
  return false;
}

function isRegionalIndicator(codePoint: number) {
  return codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
}

/** Marks that join the character before them (variation selectors, skin tones, tags, keycap, accents). */
function isExtend(codePoint: number) {
  return (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x064b && codePoint <= 0x065f) ||
    codePoint === 0x0670 ||
    codePoint === 0x20e3 ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff) ||
    (codePoint >= 0xe0020 && codePoint <= 0xe007f)
  );
}

const ZWJ = 0x200d;

/** Grapheme count without Intl.Segmenter: enough to tell one emoji from more. */
export function countGraphemesFallback(value: string) {
  let count = 0;
  let previous: number | null = null;
  let pendingRegional = false;
  for (const char of value) {
    const codePoint = char.codePointAt(0) as number;
    const joins: boolean =
      previous !== null &&
      (isExtend(codePoint) ||
        codePoint === ZWJ ||
        (previous === ZWJ && isPictographic(codePoint)) ||
        (pendingRegional && isRegionalIndicator(codePoint)));
    if (!joins) count += 1;
    pendingRegional = isRegionalIndicator(codePoint) ? !(joins && pendingRegional) : false;
    previous = codePoint;
  }
  return count;
}

type SegmenterLike = new (locale: string, options: { granularity: "grapheme" }) => {
  segment: (value: string) => Iterable<unknown>;
};

function countGraphemes(value: string) {
  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterLike }).Segmenter;
  if (!Segmenter) return countGraphemesFallback(value);
  return [...new Segmenter("en", { granularity: "grapheme" }).segment(value)].length;
}

function utf8Length(value: string) {
  let bytes = 0;
  for (const char of value) {
    const codePoint = char.codePointAt(0) as number;
    bytes += codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
  }
  return bytes;
}

export function isSingleEmoji(
  value: unknown,
  count: (value: string) => number = countGraphemes,
): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  if (utf8Length(value) > 32) return false;
  if (count(value) !== 1) return false;
  for (const char of value) {
    const codePoint = char.codePointAt(0) as number;
    if (isPictographic(codePoint) || isRegionalIndicator(codePoint)) return true;
  }
  return false;
}
