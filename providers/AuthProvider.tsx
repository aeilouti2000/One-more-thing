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
  globalThis.localStorage.setItem(PENDING_AUTH_STATE_KEY, state);
}

function clearPendingAuthState() {
  try {
    globalThis.localStorage.removeItem(PENDING_AUTH_STATE_KEY);
  } catch {
    // Ignore storage failures while clearing a consumed nonce.
  }
}

function getAuthTokens(url: string) {
  if (!url.startsWith(AUTH_REDIRECT_URL)) return null;

  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");
  const query =
    queryIndex >= 0 && (hashIndex < 0 || queryIndex < hashIndex)
      ? url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined)
      : "";
  const fragment = hashIndex >= 0 ? url.slice(hashIndex + 1) : "";
  const queryParams = new URLSearchParams(query);
  const fragmentParams = new URLSearchParams(fragment);
  const accessToken =
    fragmentParams.get("access_token") ?? queryParams.get("access_token");
  const refreshToken =
    fragmentParams.get("refresh_token") ?? queryParams.get("refresh_token");
  const state = queryParams.get("state") ?? fragmentParams.get("state");

  return accessToken && refreshToken
    ? { accessToken, refreshToken, state }
    : null;
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
      const tokens = getAuthTokens(url);
      if (!tokens) return false;

      const pendingState = readPendingAuthState();
      if (!pendingState || !tokens.state || tokens.state !== pendingState) {
        return false;
      }
      clearPendingAuthState();

      const { data: authData, error } = await supabase.auth.setSession({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      });
      if (error) {
        logError("confirm_email", error);
        return false;
      }
      if (isMounted) setSession(authData.session);
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
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      logError("sign_in", error);
      return { error: formatAppError(error) };
    }

    return { error: null };
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
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

    const signInResult = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInResult.error) {
      if (
        signInResult.error.message.toLowerCase().includes("email not confirmed")
      ) {
        return { error: null, requiresEmailConfirmation: true };
      }
      clearPendingAuthState();
      logError("sign_up_auto_login", signInResult.error);
      return { error: formatAppError(signInResult.error) };
    }

    clearPendingAuthState();
    return { error: null };
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
