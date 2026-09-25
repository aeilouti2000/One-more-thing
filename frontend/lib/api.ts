import "@/lib/session-storage";

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000/api").replace(/\/$/, "");
const SESSION_KEY = "omt.session";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
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
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const session = auth ? readSession() : null;
  if (session) headers.set("Authorization", `Bearer ${session.accessToken}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : "Network request failed", "NETWORK");
  }

  if (response.status === 401 && auth && allowRefresh) {
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
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, auth = true) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }, auth),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "DELETE", body: body === undefined ? undefined : JSON.stringify(body) }),
};

export async function restoreSession() {
  const session = readSession();
  if (!session) return null;
  try {
    const user = await api.get<AuthUser>("/auth/me");
    writeSession({ ...session, user });
    return user;
  } catch {
    return readSession()?.user ?? null;
  }
}

export async function login(email: string, password: string) {
  const session = await api.post<AuthSession>("/auth/login", { email, password }, false);
  writeSession(session);
  return session.user;
}

export async function signUp(name: string, email: string, password: string) {
  const session = await api.post<AuthSession>("/auth/signup", { name, email, password }, false);
  writeSession(session);
  return session.user;
}

export async function changePassword(currentPassword: string, newPassword: string) {
  await api.post("/auth/change-password", { currentPassword, newPassword });
  clearSession();
}

export async function signOut() {
  const session = readSession();
  clearSession();
  if (!session) return;
  await api.post("/auth/logout", { refreshToken: session.refreshToken }, false).catch(() => undefined);
}
