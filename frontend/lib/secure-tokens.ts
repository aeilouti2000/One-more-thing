import { Platform } from "react-native";

type SecureStoreModule = typeof import("expo-secure-store");

export type StoredTokens = { accessToken: string; refreshToken: string };

const KEY = "omt.tokens";

let store: SecureStoreModule | null | undefined;

/**
 * The phone's encrypted storage (Keychain / Keystore). Null on the web, and in
 * an app build made before the module was added: sign-in then keeps working
 * from regular storage, as it did before.
 */
function secureStore() {
  if (store !== undefined) return store;
  store = null;
  if (Platform.OS === "web") return store;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require("expo-secure-store") as SecureStoreModule;
    // Throws when the native side is missing from this build.
    loaded.getItem(KEY);
    store = loaded;
  } catch {
    store = null;
  }
  return store;
}

export function readSecureTokens(): StoredTokens | null {
  try {
    const raw = secureStore()?.getItem(KEY);
    if (!raw) return null;
    const tokens = JSON.parse(raw) as Partial<StoredTokens>;
    if (!tokens.accessToken || !tokens.refreshToken) return null;
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  } catch {
    return null;
  }
}

/**
 * Saves the tokens (null clears them). False when encrypted storage is not
 * available, so the caller can fall back to regular storage.
 */
export function writeSecureTokens(tokens: StoredTokens | null) {
  const secure = secureStore();
  if (!secure) return false;
  try {
    // Written in place rather than deleted: deleting is asynchronous and could
    // land after the next sign-in has saved its tokens.
    secure.setItem(KEY, tokens ? JSON.stringify(tokens) : "");
    return true;
  } catch {
    return false;
  }
}
