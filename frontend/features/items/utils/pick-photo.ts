import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import type { PickedPhoto } from "@/features/items/api/items";

export type PhotoSource = "camera" | "library";

/**
 * Take or choose one photo for an item. Compressed on the phone so the upload
 * stays small; the server resizes it again and strips its metadata.
 */
export async function pickItemPhoto(
  source: PhotoSource,
): Promise<{ ok: true; photo: PickedPhoto } | { ok: false; denied: boolean }> {
  // Android's photo picker needs no permission; iOS and the camera do.
  if (source === "camera" || Platform.OS === "ios") {
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return { ok: false, denied: true };
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: 0.7,
    exif: false,
  };
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  if (!asset?.uri) return { ok: false, denied: false };
  return {
    ok: true,
    photo: {
      uri: asset.uri,
      mimeType: asset.mimeType,
      fileName: asset.fileName,
    },
  };
}
