import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import { extractReceiptText, receiptOcrReady } from "@/modules/receipt-ocr/src/index";
import { matchReceiptLines } from "@/features/items/utils/receipt-match";
import { parseReceiptText } from "@/features/items/utils/receipt-parse";

export type ReceiptScan = {
  scanId: number;
  total: number | null;
  lines: { id: string; name: string; amount: number }[];
  matches: { itemId: string; lineId: string }[];
};

export type ScanReceiptError =
  | "scanReceiptFailed"
  | "scanReceiptEmpty"
  | "scanReceiptPermission"
  | "scanReceiptNeedsBuild";

export async function pickReceiptPhoto(
  source: "camera" | "library",
): Promise<{ ok: true; uri: string } | { ok: false; error: ScanReceiptError | null }> {
  if (source === "camera" || Platform.OS === "ios") {
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return { ok: false, error: "scanReceiptPermission" };
    }
  }

  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          quality: 0.92,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.92,
        });
  if (result.canceled || !result.assets[0]?.uri) {
    return { ok: false, error: null };
  }
  return { ok: true, uri: result.assets[0].uri };
}

export async function interpretReceiptPhoto(options: {
  uri: string;
  preferArabic: boolean;
  items: { id: string; name: string; quantity?: number }[];
}): Promise<{ ok: true; scan: ReceiptScan } | { ok: false; error: ScanReceiptError }> {
  if (!receiptOcrReady()) {
    return { ok: false, error: "scanReceiptNeedsBuild" };
  }
  const text = await extractReceiptText(options.uri, options.preferArabic);
  const lines = Array.isArray(text) ? text : [];
  const parsed = parseReceiptText(lines.join("\n"));
  if (parsed.lines.length === 0 && parsed.total === null) {
    return { ok: false, error: "scanReceiptEmpty" };
  }
  return {
    ok: true,
    scan: {
      scanId: Date.now(),
      total: parsed.total,
      lines: parsed.lines.map((line) => ({
        id: line.id,
        name: line.name,
        amount: line.amount,
      })),
      matches: matchReceiptLines(options.items, parsed.lines),
    },
  };
}

export async function readReceiptPhoto(options: {
  source: "camera" | "library";
  preferArabic: boolean;
  items: { id: string; name: string; quantity?: number }[];
}): Promise<{ ok: true; scan: ReceiptScan } | { ok: false; error: ScanReceiptError | null }> {
  try {
    const picked = await pickReceiptPhoto(options.source);
    if (!picked.ok) return picked;
    return await interpretReceiptPhoto({
      uri: picked.uri,
      preferArabic: options.preferArabic,
      items: options.items,
    });
  } catch {
    return { ok: false, error: "scanReceiptFailed" };
  }
}
