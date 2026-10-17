import * as ImagePicker from "expo-image-picker";
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

export async function readReceiptPhoto(options: {
  source: "camera" | "library";
  preferArabic: boolean;
  items: { id: string; name: string; quantity?: number }[];
}): Promise<{ ok: true; scan: ReceiptScan } | { ok: false; error: ScanReceiptError | null }> {
  if (!receiptOcrReady()) {
    return { ok: false, error: "scanReceiptNeedsBuild" };
  }

  const permission =
    options.source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return { ok: false, error: "scanReceiptPermission" };
  }

  try {
    const result =
      options.source === "camera"
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 0.85,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.85,
          });
    if (result.canceled || !result.assets[0]?.uri) {
      return { ok: false, error: null };
    }

    const text = await extractReceiptText(result.assets[0].uri, options.preferArabic);
    const parsed = parseReceiptText(text.join("\n"));
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
  } catch {
    return { ok: false, error: "scanReceiptFailed" };
  }
}
