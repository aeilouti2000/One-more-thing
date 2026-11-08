import Constants from "expo-constants";
import { Platform } from "react-native";
import "@/features/auth/utils/session-storage";
import { clearCurrentProfileCache } from "@/features/offline/profile-cache";
import { withTimeout } from "@/lib/with-timeout";

function resolveApiUrl() {
  const configured = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000/api").replace(/\/$/, "");
  if (Platform.OS === "web") return configured;

  try {
    const url = new URL(configured);
    const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
    const devHost = hostUri?.split(":")[0];
    if (!isLoopback || !devHost || devHost === "localhost" || devHost === "127.0.0.1") {
      return configured;
    }
    // `expo start --lan`: the dev machine is reachable by IP, so call the API
    // on its own port there.
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(devHost)) {
      url.hostname = devHost;
      return url.toString().replace(/\/$/, "");
    }
    // `expo start --tunnel`: only the Metro port is tunnelled (over HTTPS).
    // metro.config.js proxies /api through it to the local backend.
    return `https://${devHost}${url.pathname}`.replace(/\/$/, "");
  } catch {
    return configured;
  }
}

const API_URL = resolveApiUrl();
const REQUEST_TIMEOUT_MS = 20000;
/** Photo uploads can be slow on mobile data. */
const UPLOAD_TIMEOUT_MS = 60000;

/** Absolute URL for an API path, e.g. an image to hand to <Image>. */
export function apiUrl(path: string) {
  return `${API_URL}${path}`;
}

/** fetch that gives up instead of hanging forever on an unreachable host. */
async function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Network request timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
const SESSION_KEY = "omt.session";

export type AuthUser = {
  id: string;
  /** The username (historical field name). */
  email: string;
  name: string;
  createdAt: string;
  /** Real email address. Optional: profiles cached by older versions lack it. */
  contactEmail?: string | null;
  emailVerified?: boolean;
  hasPassword?: boolean;
  googleEmail?: string | null;
  googleLinked?: boolean;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

export class ApiError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

type Listener = (user: AuthUser | null) => void;

const listeners = new Set<Listener>();

export function onAuthChange(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(user: AuthUser | null) {
  for (const listener of listeners) listener(user);
}

function readStorage(key: string) {
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    globalThis.localStorage.setItem(key, value);
  } catch {
    // Native storage can be unavailable during the first server render.
  }
}

function removeStorage(key: string) {
  try {
    globalThis.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures while clearing a session.
  }
}

export function readSession(): AuthSession | null {
  const raw = readStorage(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as AuthSession;
    if (!session.accessToken || !session.refreshToken || !session.user?.id) return null;
    return session;
  } catch {
    return null;
  }
}

function writeSession(session: AuthSession) {
  writeStorage(SESSION_KEY, JSON.stringify(session));
  emit(session.user);
}

function clearSession() {
  removeStorage(SESSION_KEY);
  emit(null);
}

function errorFromBody(body: unknown, status: number) {
  if (!body || typeof body !== "object") {
    return new ApiError(`Request failed (${status})`);
  }
  const record = body as { message?: unknown; code?: unknown };
  const message = Array.isArray(record.message)
    ? record.message.join(" ")
    : typeof record.message === "string"
      ? record.message
      : `Request failed (${status})`;
  const code = typeof record.code === "string" ? record.code : undefined;
  return new ApiError(message, code);
}

let refreshTask: Promise<boolean> | null = null;

async function refreshSession() {
  const current = readSession();
  if (!current) return false;

  let response: Response;
  try {
    // Plain fetch on purpose: if a slow refresh succeeds on the server after we
    // gave up, a rotated refresh token would be lost and the user signed out.
    response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    });
  } catch {
    return false;
  }

  if (response.status === 401) {
    clearSession();
    return false;
  }

  if (!response.ok) return false;

  writeSession((await response.json()) as AuthSession);
  return true;
}

async function request<T>(path: string, init: RequestInit = {}, auth = true, allowRefresh = true): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  // FormData sets its own multipart Content-Type (with the boundary).
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !isForm && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const session = auth ? readSession() : null;
  if (session) headers.set("Authorization", `Bearer ${session.accessToken}`);

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${API_URL}${path}`,
      {
        ...init,
        headers,
        // Avoid serving a stale household after cost-settings PATCH (web HTTP cache).
        cache: "no-store",
      },
      isForm ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS,
    );
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : "Network request failed", "NETWORK");
  }

  if (response.status === 401 && auth && allowRefresh) {
    const unauthorized = await response
      .clone()
      .json()
      .catch(() => null);
    const unauthorizedError = errorFromBody(unauthorized, response.status);
    if (unauthorizedError.code && unauthorizedError.code !== "NOT_SIGNED_IN" && unauthorizedError.code !== "INVALID_TOKEN") {
      throw unauthorizedError;
    }

    refreshTask ??= refreshSession().finally(() => {
      refreshTask = null;
    });
    const refreshed = await refreshTask;
    if (refreshed) return request<T>(path, init, true, false);
    if (!readSession()) throw new ApiError("Sign in required", "NOT_SIGNED_IN");
    throw new ApiError("Request failed", "NETWORK");
  }

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => null);
  if (!response.ok) throw errorFromBody(body, response.status);
  return body as T;
}

export const api = {
  get: <T>(path: string, auth = true) => request<T>(path, {}, auth),
  post: <T>(path: string, body?: unknown, auth = true) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }, auth),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  /** Multipart upload (e.g. a photo). */
  upload: <T>(path: string, form: FormData, method: "POST" | "PUT" = "PUT") =>
    request<T>(path, { method, body: form }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "DELETE", body: body === undefined ? undefined : JSON.stringify(body) }),
};

export async function restoreSession() {
  const session = readSession();
  if (!session) return null;
  void refreshStoredProfile(session);
  return session.user;
}

async function refreshStoredProfile(session: AuthSession) {
  try {
    const user = await withTimeout(api.get<AuthUser>("/auth/me"), 8000);
    const current = readSession();
    if (!current || current.user.id !== session.user.id) return;
    writeSession({ ...current, user });
  } catch {
    // Keep the stored profile so the app can open with no connection.
  }
}

export async function login(email: string, password: string) {
  const session = await api.post<AuthSession>("/auth/login", { email, password }, false);
  writeSession(session);
  return session.user;
}

export async function signUp(name: string, email: string, password: string, contactEmail: string) {
  const session = await api.post<AuthSession>(
    "/auth/signup",
    { name, email, password, contactEmail },
    false,
  );
  writeSession(session);
  return session.user;
}

export async function signInWithGoogle(idToken: string) {
  const session = await api.post<AuthSession & { isNew: boolean }>("/auth/google", { idToken }, false);
  writeSession({ accessToken: session.accessToken, refreshToken: session.refreshToken, user: session.user });
  return session;
}

function storeUser(user: AuthUser) {
  const session = readSession();
  if (session) writeSession({ ...session, user });
  else emit(user);
  return user;
}

export async function linkGoogle(idToken: string) {
  return storeUser(await api.post<AuthUser>("/auth/google/link", { idToken }));
}

export async function unlinkGoogle() {
  return storeUser(await api.delete<AuthUser>("/auth/google"));
}

export async function setEmail(email: string) {
  return storeUser(await api.post<AuthUser>("/auth/email", { email }));
}

export async function resendEmailCode() {
  return api.post<{ sent: boolean; email: string }>("/auth/email/resend");
}

export async function verifyEmail(code: string) {
  return storeUser(await api.post<AuthUser>("/auth/email/verify", { code }));
}

export async function requestPasswordReset(login: string) {
  await api.post("/auth/password/forgot", { login }, false);
}

export async function resetPassword(login: string, code: string, newPassword: string) {
  const session = await api.post<AuthSession>("/auth/password/reset", { login, code, newPassword }, false);
  writeSession(session);
  return session.user;
}

/** `currentPassword` is omitted when a Google-only account sets its first password. */
/** Resolves true when the server ended every session (a changed password). */
export async function changePassword(currentPassword: string | undefined, newPassword: string) {
  const result = await api.post<{ signedOut?: boolean } | undefined>("/auth/change-password", {
    currentPassword,
    newPassword,
  });
  // A first password on a Google-only account keeps this session.
  if (result?.signedOut === false) {
    const session = readSession();
    if (session) await refreshStoredProfile(session);
    return false;
  }
  clearCurrentProfileCache();
  clearSession();
  return true;
}

export async function updateProfile(input: { name?: string; email?: string }) {
  const user = await api.patch<AuthUser>("/auth/me", input);
  const session = readSession();
  if (session) writeSession({ ...session, user });
  else emit(user);
  return user;
}

export async function deleteAccount(proof: { password?: string; googleIdToken?: string }) {
  await api.delete("/auth/me", proof);
  clearCurrentProfileCache();
  clearSession();
}

export async function signOut() {
  const session = readSession();
  clearCurrentProfileCache();
  clearSession();
  if (!session) return;
  await api.post("/auth/logout", { refreshToken: session.refreshToken }, false).catch(() => undefined);
}
