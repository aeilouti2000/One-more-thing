import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { countGraphemesFallback, isPictographic, isSingleEmoji } from "@/features/icons/emoji";
import { defaultIcon, iconKey, resolveIcon, withIcon } from "@/features/icons/resolve";
import type { HomeIcon } from "@/features/icons/types";

// The server checks emoji with the same list (backend/src/modules/icons/emoji.cases.json).
const cases = JSON.parse(
  readFileSync(new URL("../../../backend/src/modules/icons/emoji.cases.json", import.meta.url), "utf8"),
) as [string, boolean][];

test("isSingleEmoji agrees with the server on every shared case", () => {
  for (const [input, expected] of cases) {
    assert.equal(isSingleEmoji(input), expected, JSON.stringify(input));
  }
});

test("the phone's own grapheme count (no Intl.Segmenter) gives the same answers", () => {
  for (const [input, expected] of cases) {
    assert.equal(isSingleEmoji(input, countGraphemesFallback), expected, JSON.stringify(input));
  }
  for (const flag of ["🏴󠁧󠁢󠁥󠁮󠁧󠁿", "🇯🇴", "👩🏽‍💻", "🧑‍🤝‍🧑"]) {
    assert.equal(countGraphemesFallback(flag), 1, flag);
  }
  assert.equal(countGraphemesFallback("🇯🇴🇯🇴"), 2);
});

test("the pictograph table matches Unicode Extended_Pictographic", () => {
  const unicode = /\p{Extended_Pictographic}/u;
  for (let codePoint = 0; codePoint <= 0x1ffff; codePoint += 1) {
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) continue;
    assert.equal(isPictographic(codePoint), unicode.test(String.fromCodePoint(codePoint)), codePoint.toString(16));
  }
});

const icons: HomeIcon[] = [
  { kind: "category", key: "meat", label: null, emoji: "🍗", imageId: null },
  { kind: "category", key: "bakery-id", label: null, emoji: null, imageId: "img-1" },
  { kind: "shop", key: "carrefour", label: "Carrefour", emoji: "🏬", imageId: null },
  { kind: "shop", key: "city mart", label: "City Mart", emoji: null, imageId: "img-2" },
];

test("an icon is the uploaded image, else the emoji, else the default", () => {
  assert.deepEqual(resolveIcon(icons, "category", "bakery-id"), { type: "image", imageId: "img-1" });
  assert.deepEqual(resolveIcon(icons, "category", "meat"), { type: "emoji", emoji: "🍗", chosen: true });
  assert.deepEqual(resolveIcon(icons, "category", "vegetables"), { type: "emoji", emoji: "🥬", chosen: false });
  assert.deepEqual(resolveIcon(undefined, "category", "meat"), { type: "emoji", emoji: "🥩", chosen: false });
});

test("a removed custom category falls back to the custom default", () => {
  assert.deepEqual(resolveIcon(icons, "category", "gone-uuid"), { type: "emoji", emoji: "🏷️", chosen: false });
  assert.equal(defaultIcon("category", ""), "🧾");
});

test("a shop icon belongs to the name, on every trip with that name", () => {
  for (const name of ["Carrefour", " carrefour ", "CARREFOUR"]) {
    assert.deepEqual(resolveIcon(icons, "shop", iconKey({ kind: "shop", name })), {
      type: "emoji",
      emoji: "🏬",
      chosen: true,
    });
  }
  // A renamed trip shows its new name's icon.
  assert.deepEqual(resolveIcon(icons, "shop", iconKey({ kind: "shop", name: "City  Mart" })), {
    type: "image",
    imageId: "img-2",
  });
  assert.deepEqual(resolveIcon(icons, "shop", iconKey({ kind: "shop", name: "Butcher" })), {
    type: "emoji",
    emoji: "🏪",
    chosen: false,
  });
  // A trip with no name.
  assert.deepEqual(resolveIcon(icons, "shop", ""), { type: "emoji", emoji: "🛒", chosen: false });
});

test("withIcon replaces, adds and removes one icon", () => {
  const replaced = withIcon(icons, "category", "meat", {
    kind: "category",
    key: "meat",
    label: null,
    emoji: null,
    imageId: "img-3",
  });
  assert.equal(replaced.length, icons.length);
  assert.deepEqual(resolveIcon(replaced, "category", "meat"), { type: "image", imageId: "img-3" });
  const removed = withIcon(icons, "category", "meat", null);
  assert.equal(removed.length, icons.length - 1);
  // A reset answer (no emoji, no image) removes it too.
  const reset = withIcon(icons, "shop", "carrefour", {
    kind: "shop",
    key: "carrefour",
    label: null,
    emoji: null,
    imageId: null,
  });
  assert.equal(reset.some((icon) => icon.key === "carrefour"), false);
  assert.equal(withIcon(undefined, "shop", "x", null).length, 0);
});
