import { Platform, Share } from "react-native";
import type { Purchase } from "@/types/purchase";

export const UNDO_BOUGHT_MS = 2 * 60 * 1000;

export function canUndoBought(boughtAt: string | undefined, now = Date.now()) {
  if (!boughtAt) return false;
  const at = new Date(boughtAt).getTime();
  return Number.isFinite(at) && at + UNDO_BOUGHT_MS > now;
}

export function formatNeededShare(
  items: Purchase[],
  labels: { title: string; urgent: string },
) {
  const lines = [...items]
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.name.localeCompare(b.name))
    .map((item) => {
      const quantity = item.unit ? `${item.quantity} ${item.unit}` : `x${item.quantity}`;
      return item.urgent
        ? `${item.name} — ${quantity} — ${labels.urgent}`
        : `${item.name} — ${quantity}`;
    });
  return [labels.title, ...lines].join("\n");
}

export async function shareNeededText(message: string) {
  if (Platform.OS === "web" && typeof navigator !== "undefined") {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text: message });
        return "shared" as const;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw error;
      }
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(message);
      return "copied" as const;
    }
  }

  await Share.share({ message });
  return "shared" as const;
}
