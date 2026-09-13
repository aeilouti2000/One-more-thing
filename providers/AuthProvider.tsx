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
import { translate } from "@/constants/i18n";
import { formatAppError, logError } from "@/lib/errors";
import { supabase } from "@/lib/supabase";

void SplashScreen.preventAutoHideAsync();

type AuthResult = {
  error: string | null;
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

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return;
        setSession(data.session);
      })
      .catch((error) => {
        logError("get_session", error);
        if (!isMounted) return;
        setSession(null);
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoading(false);
        void SplashScreen.hideAsync();
      });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
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
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { name: name.trim() },
      },
    });

    if (error) {
      logError("sign_up", error);
      return { error: formatAppError(error) };
    }

    if (data.user?.identities && data.user.identities.length === 0) {
      return { error: translate("errorEmailTaken") };
    }

    if (data.session) {
      return { error: null };
    }

    const signInResult = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInResult.error) {
      logError("sign_up_auto_login", signInResult.error);
      return { error: formatAppError(signInResult.error) };
    }

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
