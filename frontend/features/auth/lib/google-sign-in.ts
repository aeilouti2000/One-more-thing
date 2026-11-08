import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

type GoogleModule = typeof import("@react-native-google-signin/google-signin");

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";

let cached: GoogleModule | null | undefined;
let configured = false;

/**
 * The native module only exists in real builds (EAS APK / dev build), not in
 * Expo Go or on web, so it's loaded lazily and the button hides without it.
 */
function load(): GoogleModule | null {
  if (cached !== undefined) return cached;
  if (
    Platform.OS === "web" ||
    !WEB_CLIENT_ID ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  ) {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached =
      require("@react-native-google-signin/google-signin") as GoogleModule;
  } catch {
    cached = null;
  }
  return cached;
}

export function isGoogleSignInAvailable() {
  return load() !== null;
}

export type GoogleTokenResult =
  | { type: "success"; idToken: string }
  | { type: "cancelled" }
  | { type: "error"; code: "unavailable" | "play_services" | "failed" };

/**
 * Opens Google's account picker and returns an ID token for the backend.
 * Signs out of the local Google session first so the picker always shows,
 * letting people choose which account to use.
 */
export async function getGoogleIdToken(): Promise<GoogleTokenResult> {
  const google = load();
  if (!google) return { type: "error", code: "unavailable" };
  const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } =
    google;

  try {
    if (!configured) {
      GoogleSignin.configure({
        webClientId: WEB_CLIENT_ID,
        scopes: ["email", "profile"],
      });
      configured = true;
    }
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    await GoogleSignin.signOut().catch(() => null);
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return { type: "cancelled" };
    const idToken = response.data.idToken;
    if (!idToken) return { type: "error", code: "failed" };
    return { type: "success", idToken };
  } catch (error) {
    if (isErrorWithCode(error)) {
      if (
        error.code === statusCodes.SIGN_IN_CANCELLED ||
        error.code === statusCodes.IN_PROGRESS
      ) {
        return { type: "cancelled" };
      }
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return { type: "error", code: "play_services" };
      }
    }
    console.error("[google_sign_in]", error);
    return { type: "error", code: "failed" };
  }
}
