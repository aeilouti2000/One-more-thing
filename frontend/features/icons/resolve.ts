import {
  CATEGORY_ICONS,
  CUSTOM_CATEGORY_ICON,
  SHOP_ICON,
  TRIP_TOTALS_ICON,
  UNNAMED_SHOP_ICON,
} from "@/constants/icons";
import type { HomeIcon, IconKind, IconTarget } from "@/features/icons/types";
import { normalizeName } from "@/features/items/utils/insights";

/** What to draw for one category or shop. */
export type ResolvedIcon =
  | { type: "image"; imageId: string }
  | { type: "emoji"; emoji: string; chosen: boolean };

/**
 * The stored key of an icon. A category is keyed by its id; a shop by its
 * name, normalised the way the server does it (" Carrefour " = "carrefour").
 */
export function iconKey(target: IconTarget) {
  return target.kind === "shop" ? normalizeName(target.name) : target.key;
}

export function defaultIcon(kind: IconKind, key: string) {
  if (kind === "shop") return key ? SHOP_ICON : UNNAMED_SHOP_ICON;
  if (key === "") return TRIP_TOTALS_ICON;
  return CATEGORY_ICONS[key] ?? CUSTOM_CATEGORY_ICON;
}

export function findIcon(icons: readonly HomeIcon[] | undefined, kind: IconKind, key: string) {
  if (!icons || !key) return undefined;
  return icons.find((icon) => icon.kind === kind && icon.key === key);
}

/**
 * The home's uploaded image, else its emoji, else the default. A category
 * that no longer exists has no row (the server removes it) and so falls back
 * to the default too.
 */
export function resolveIcon(
  icons: readonly HomeIcon[] | undefined,
  kind: IconKind,
  key: string,
): ResolvedIcon {
  const icon = findIcon(icons, kind, key);
  if (icon?.imageId) return { type: "image", imageId: icon.imageId };
  if (icon?.emoji) return { type: "emoji", emoji: icon.emoji, chosen: true };
  return { type: "emoji", emoji: defaultIcon(kind, key), chosen: false };
}

/** Puts one icon (the server's answer) into the home's list; null removes it. */
export function withIcon(
  icons: readonly HomeIcon[] | undefined,
  kind: IconKind,
  key: string,
  next: HomeIcon | null,
): HomeIcon[] {
  const rest = (icons ?? []).filter((icon) => !(icon.kind === kind && icon.key === key));
  if (!next || (!next.emoji && !next.imageId)) return rest;
  return [...rest, next].sort((a, b) =>
    a.kind === b.kind ? a.key.localeCompare(b.key) : a.kind.localeCompare(b.kind),
  );
}
