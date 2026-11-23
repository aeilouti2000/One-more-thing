/** Which icon: a category (by its id) or a shop (by its name, keyed). */
export type IconKind = "category" | "shop";

/**
 * An icon a home chose, exactly as the server lists it (GET /homes/:homeId/icons
 * and the changes answer). No row means the default icon.
 */
export type HomeIcon = {
  kind: IconKind;
  /** Category: its id. Shop: the name, normalised (normalizeName). */
  key: string;
  /** Shop only: the name as last typed. */
  label: string | null;
  emoji: string | null;
  /** Uploaded image; load it from GET /icons/:imageId. */
  imageId: string | null;
};

/** What an icon change is about: a category id, or a shop name as typed. */
export type IconTarget = { kind: "category"; key: string } | { kind: "shop"; name: string };
