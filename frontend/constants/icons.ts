/**
 * Default icons, used when a home has not chosen its own (spec 5.4).
 * Emoji are drawn by the phone, so they look slightly different per brand.
 */
export const CATEGORY_ICONS: Record<string, string> = {
  supermarket: "🛒",
  vegetables: "🥬",
  meat: "🥩",
  coffee: "☕",
  pharmacy: "💊",
  other: "📦",
};

/** A category the home made itself. */
export const CUSTOM_CATEGORY_ICON = "🏷️";
/** A trip with a name. */
export const SHOP_ICON = "🏪";
/** A trip with no name yet. */
export const UNNAMED_SHOP_ICON = "🛒";
/** The part of trip totals not split by category (category ""). */
export const TRIP_TOTALS_ICON = "🧾";

/** The row of suggestions in the change sheet, per built-in category. */
const CATEGORY_SUGGESTIONS: Record<string, string[]> = {
  supermarket: ["🛒", "🧺", "🥛", "🍞", "🧀", "🥚", "🧂", "🍚", "🫒", "🧃", "🧻"],
  vegetables: ["🥬", "🥕", "🍅", "🥒", "🧅", "🥔", "🍋", "🍎", "🍌", "🌿", "🫑"],
  meat: ["🥩", "🍗", "🐟", "🥓", "🍖", "🌭", "🥚", "🧀", "🥛", "🍞", "🧂"],
  coffee: ["☕", "🫖", "🍵", "🥤", "🧋", "🍪", "🥐", "🍰", "🍫", "🧁", "🥛"],
  pharmacy: ["💊", "🩹", "🧴", "🧼", "🪥", "🌡️", "🧻", "💉", "🩺", "👶", "🧽"],
  other: ["📦", "🏷️", "🧹", "🧽", "🔋", "💡", "🎁", "🐾", "🧸", "🪴", "🛠️"],
};

const CUSTOM_SUGGESTIONS = ["🏷️", "🍞", "🥖", "🧁", "🍕", "🐾", "👶", "🧴", "🧹", "🎁", "🪴"];

export const SHOP_SUGGESTIONS = ["🏪", "🛒", "🏬", "🥖", "🥩", "💊", "☕", "🐟", "🥬", "🧺", "🧀"];

export function iconSuggestions(kind: "category" | "shop", key: string) {
  if (kind === "shop") return SHOP_SUGGESTIONS;
  return CATEGORY_SUGGESTIONS[key] ?? CUSTOM_SUGGESTIONS;
}
