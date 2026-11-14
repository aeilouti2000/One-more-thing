import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";

/**
 * Hands a CSV file to the phone's share sheet (save, email, WhatsApp...).
 * "unavailable" when this device can't share files.
 */
export async function shareCsvFile(
  filename: string,
  csv: string,
  dialogTitle: string,
): Promise<"shared" | "unavailable"> {
  if (Platform.OS === "web") {
    if (typeof document === "undefined") return "unavailable";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    return "shared";
  }

  const Sharing = await import("expo-sharing");
  if (!(await Sharing.isAvailableAsync())) return "unavailable";
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  await file.write(csv);
  await Sharing.shareAsync(file.uri, { mimeType: "text/csv", dialogTitle, UTI: "public.comma-separated-values-text" });
  return "shared";
}
