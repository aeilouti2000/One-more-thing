import { File } from "expo-file-system";
import { Platform } from "react-native";
import { translate } from "@/constants/i18n";
import { iconKey, withIcon } from "@/features/icons/resolve";
import type { HomeIcon, IconTarget } from "@/features/icons/types";
import type { PickedPhoto } from "@/features/items/api/items";
import { isOnline } from "@/features/offline/network";
import { defineChange, perform } from "@/features/offline/outbox";
import { qk, readCache, writeCache } from "@/features/offline/query-client";
import { readThrough } from "@/features/offline/read";
import { api, apiUrl } from "@/lib/api";
import { formatAppError } from "@/lib/errors";

/** Where <Image> loads an icon from. Images never change under one id. */
export function iconImageUrl(imageId: string) {
  return apiUrl(`/icons/${imageId}`);
}

/** The home's icons as this phone has them; undefined when never loaded. */
export function cachedIcons(homeId: string) {
  return readCache<HomeIcon[]>(qk.icons(homeId));
}

/**
 * Loads the home's icons into the saved copy. The sync engine keeps them up
 * to date once it runs; until then the screens that show or change icons
 * call this.
 */
export async function fetchIcons(homeId: string) {
  const result = await readThrough<HomeIcon[]>(qk.icons(homeId), () =>
    api.get<HomeIcon[]>(`/homes/${homeId}/icons`),
  );
  if (result.data) return { icons: result.data, error: null };
  return { icons: [] as HomeIcon[], error: formatAppError(result.error) };
}

function body(target: IconTarget): Record<string, string> {
  return target.kind === "shop"
    ? { kind: target.kind, name: target.name.trim() }
    : { kind: target.kind, key: target.key };
}

function put(homeId: string, target: IconTarget, next: HomeIcon | null) {
  const key = iconKey(target);
  writeCache<HomeIcon[]>(qk.icons(homeId), (current) => withIcon(current, target.kind, key, next));
}

const emojiChange = defineChange<{ homeId: string; target: IconTarget; emoji: string }, HomeIcon>(
  "icon.emoji",
  (payload) =>
    api.put<HomeIcon>(`/homes/${payload.homeId}/icons`, { ...body(payload.target), emoji: payload.emoji }),
);

const resetChange = defineChange<{ homeId: string; target: IconTarget }>("icon.reset", (payload) => {
  // Built by hand: React Native's URLSearchParams is incomplete on some versions.
  const query = Object.entries(body(payload.target))
    .map(([field, value]) => `${field}=${encodeURIComponent(value)}`)
    .join("&");
  return api.delete(`/homes/${payload.homeId}/icons?${query}`);
});

function labelOf(target: IconTarget) {
  return target.kind === "shop" ? target.name.trim() : undefined;
}

/** Sets an emoji. On the phone at once; sent now or when the connection returns. */
export async function setIconEmoji(homeId: string, target: IconTarget, emoji: string) {
  const before = cachedIcons(homeId);
  put(homeId, target, {
    kind: target.kind,
    key: iconKey(target),
    label: labelOf(target) ?? null,
    emoji,
    imageId: null,
  });
  const result = await perform(emojiChange, { homeId, target, emoji }, {
    action: "settings",
    title: labelOf(target) ?? emoji,
  });
  if (result.error) {
    writeCache<HomeIcon[] | undefined>(qk.icons(homeId), before);
    return { error: result.error };
  }
  if (result.data) put(homeId, target, result.data);
  return { error: null };
}

/** Back to the default icon. Works offline like an emoji change. */
export async function resetIcon(homeId: string, target: IconTarget) {
  const before = cachedIcons(homeId);
  put(homeId, target, null);
  const result = await perform(resetChange, { homeId, target }, {
    action: "settings",
    ...(labelOf(target) ? { title: labelOf(target) } : { count: 1 }),
  });
  if (result.error) {
    writeCache<HomeIcon[] | undefined>(qk.icons(homeId), before);
    return { error: result.error };
  }
  return { error: null };
}

/**
 * Uploads an image as the icon. Needs a connection: the server crops and
 * shrinks it, and the answer carries the image's id.
 */
export async function uploadIconImage(homeId: string, target: IconTarget, photo: PickedPhoto) {
  if (!isOnline()) return { error: translate("iconUploadOffline") };
  const type = photo.mimeType || "image/jpeg";
  const name = photo.fileName || "icon.jpg";
  const form = new FormData();
  for (const [field, value] of Object.entries(body(target))) form.append(field, value);
  try {
    if (Platform.OS === "web") {
      const blob = await (await fetch(photo.uri)).blob();
      form.append("file", blob, name);
    } else {
      const file = new File(photo.uri);
      // Same as item photos: Expo's fetch takes a part with name, type and bytes().
      form.append("file", {
        name,
        type,
        bytes: async () => new Uint8Array(await file.arrayBuffer()),
      } as unknown as Blob);
    }
    const saved = await api.upload<HomeIcon>(`/homes/${homeId}/icons/image`, form);
    put(homeId, target, saved);
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}
