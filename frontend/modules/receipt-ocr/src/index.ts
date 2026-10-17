import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

type ReceiptOcrNative = {
  extractText(uri: string, preferArabic: boolean): Promise<string[]>;
};

const native: ReceiptOcrNative | null =
  Platform.OS === "web" ? null : requireOptionalNativeModule<ReceiptOcrNative>("ReceiptOcr");

export function receiptOcrReady() {
  return native !== null;
}

export function extractReceiptText(uri: string, preferArabic: boolean) {
  if (!native) {
    return Promise.reject(new Error("UNSUPPORTED"));
  }
  return native.extractText(uri, preferArabic);
}
