import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import * as SplashScreen from "expo-splash-screen";
import { Linking } from "react-native";
import { translate } from "@/constants/i18n";
import { formatAppError, logError } from "@/lib/errors";
import "@/lib/session-storage";
import { supabase } from "@/lib/supabase";

void SplashScreen.preventAutoHideAsync();

// Allow this exact path plus query params in Supabase Auth redirect URLs,
// e.g. onemorething://auth/callback and onemorething://auth/callback?state=*
const AUTH_REDIRECT_URL = "onemorething://auth/callback";
const PENDING_AUTH_STATE_KEY = "auth.pendingCallbackState";

function createAuthState() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readPendingAuthState() {
  try {
    return globalThis.localStorage.getItem(PENDING_AUTH_STATE_KEY);
  } catch {
    return null;
  }
}

function writePendingAuthState(state: string) {
  try {
    globalThis.localStorage.setItem(PENDING_AUTH_STATE_KEY, state);
  } catch {
    // Confirmation can still complete if the nonce cannot be stored.
  }
}

function clearPendingAuthState() {
  try {
    globalThis.localStorage.removeItem(PENDING_AUTH_STATE_KEY);
  } catch {
    // Ignore storage failures while clearing a consumed nonce.
  }
}

function isAuthCallbackUrl(url: string) {
  const [withoutHash] = url.split("#");
  return (
    withoutHash.startsWith(AUTH_REDIRECT_URL) ||
    withoutHash.includes("/auth/callback") ||
    withoutHash.includes("/--/auth/callback")
  );
}

function parseAuthCallback(url: string) {
  if (!isAuthCallbackUrl(url)) return null;

  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");
  const query =
    queryIndex >= 0 && (hashIndex < 0 || queryIndex < hashIndex)
      ? url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined)
      : "";
  const fragment = hashIndex >= 0 ? url.slice(hashIndex + 1) : "";
  const queryParams = new URLSearchParams(query);
  const fragmentParams = new URLSearchParams(fragment);
  const read = (key: string) => fragmentParams.get(key) ?? queryParams.get(key);

  return {
    accessToken: read("access_token"),
    refreshToken: read("refresh_token"),
    code: read("code"),
    tokenHash: read("token_hash") ?? read("token"),
    type: read("type"),
    state: read("state"),
  };
}

type AuthResult = {
  error: string | null;
  requiresEmailConfirmation?: boolean;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (name: string, email: string, password: string) => Promise<AuthResult>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<AuthResult>;
  signOut: () => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    async function handleAuthUrl(url: string | null) {
      if (!url) return false;
      const callback = parseAuthCallback(url);
      if (!callback) return false;

      const pendingState = readPendingAuthState();
      if (
        callback.state &&
        pendingState &&
        callback.state !== pendingState
      ) {
        return false;
      }

      let nextSession: Session | null = null;
      if (callback.accessToken && callback.refreshToken) {
        const { data: authData, error } = await supabase.auth.setSession({
          access_token: callback.accessToken,
          refresh_token: callback.refreshToken,
        });
        if (error) {
          logError("confirm_email", error);
          return false;
        }
        nextSession = authData.session;
      } else if (callback.code) {
        const { data: authData, error } =
          await supabase.auth.exchangeCodeForSession(callback.code);
        if (error) {
          logError("confirm_email", error);
          return false;
        }
        nextSession = authData.session;
      } else if (callback.tokenHash) {
        const { data: authData, error } = await supabase.auth.verifyOtp({
          token_hash: callback.tokenHash,
          type: callback.type === "recovery" ? "recovery" : "signup",
        });
        if (error) {
          logError("confirm_email", error);
          return false;
        }
        nextSession = authData.session;
      } else {
        return false;
      }

      clearPendingAuthState();
      if (isMounted) setSession(nextSession);
      return true;
    }

    void (async () => {
      try {
        const handledRedirect = await handleAuthUrl(await Linking.getInitialURL());
        if (!handledRedirect) {
          const { data: sessionData } = await supabase.auth.getSession();
          if (isMounted) setSession(sessionData.session);
        }
      } catch (error) {
        logError("get_session", error);
        if (isMounted) setSession(null);
      } finally {
        if (!isMounted) return;
        setIsLoading(false);
        void SplashScreen.hideAsync();
      }
    })();

    const linkingSubscription = Linking.addEventListener("url", ({ url }) => {
      void handleAuthUrl(url);
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
      linkingSubscription.remove();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        logError("sign_in", error);
        return { error: formatAppError(error) };
      }

      return { error: null };
    } catch (error) {
      logError("sign_in", error);
      return { error: formatAppError(error) };
    }
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    try {
      const state = createAuthState();
      writePendingAuthState(state);
      const emailRedirectTo = `${AUTH_REDIRECT_URL}?state=${encodeURIComponent(state)}`;

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { name: name.trim() },
          emailRedirectTo,
        },
      });

      if (error) {
        clearPendingAuthState();
        logError("sign_up", error);
        return { error: formatAppError(error) };
      }

      if (data.user?.identities && data.user.identities.length === 0) {
        clearPendingAuthState();
        return { error: translate("errorEmailTaken") };
      }

      if (data.session) {
        clearPendingAuthState();
        return { error: null };
      }

      return { error: null, requiresEmailConfirmation: true };
    } catch (error) {
      clearPendingAuthState();
      logError("sign_up", error);
      return { error: formatAppError(error) };
    }
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const email = session?.user.email;
      if (!email) {
        return { error: translate("errorNeedLogin") };
      }

      if (currentPassword === newPassword) {
        return { error: translate("errorNewPasswordDifferent") };
      }

      const verify = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });

      if (verify.error) {
        logError("change_password_verify", verify.error);
        const message = formatAppError(verify.error);
        const wrongPassword =
          message === translate("errorWrongEmailOrPassword") ||
          verify.error.message.toLowerCase().includes("invalid login");
        return {
          error: wrongPassword ? translate("errorCurrentPasswordWrong") : message,
        };
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        logError("change_password", error);
        return { error: formatAppError(error) };
      }

      return { error: null };
    },
    [session],
  );

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      logError("sign_out", error);
      return { error: formatAppError(error) };
    }

    return { error: null };
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      signIn,
      signUp,
      changePassword,
      signOut,
    }),
    [session, isLoading, signIn, signUp, changePassword, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
