import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as SplashScreen from "expo-splash-screen";
import { translate } from "@/constants/i18n";
import {
  changePassword as changeAccountPassword,
  ApiError,
  login,
  onAuthChange,
  restoreSession,
  deleteAccount as removeAccount,
  signOut as endSession,
  signUp as register,
  updateProfile as updateAccountProfile,
  type AuthUser,
} from "@/lib/api";
import { formatAppError, logError } from "@/lib/errors";
import { unregisterPushDevice } from "@/features/notifications/api/push";

void SplashScreen.preventAutoHideAsync();

type AuthResult = {
  error: string | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (name: string, email: string, password: string) => Promise<AuthResult>;
  updateProfile: (input: { name?: string; email?: string }) => Promise<AuthResult>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<AuthResult>;
  deleteAccount: (password: string) => Promise<AuthResult>;
  signOut: () => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const unsubscribe = onAuthChange((next) => {
      if (isMounted) setUser(next);
    });

    void (async () => {
      try {
        const restored = await restoreSession();
        if (isMounted) setUser(restored);
      } catch (error) {
        logError("get_session", error);
        if (isMounted) setUser(null);
      } finally {
        if (!isMounted) return;
        setIsLoading(false);
        void SplashScreen.hideAsync();
      }
    })();

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      await login(email.trim(), password);
      return { error: null };
    } catch (error) {
      logError("sign_in", error);
      return { error: formatAppError(error) };
    }
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    try {
      await register(name.trim(), email.trim(), password);
      return { error: null };
    } catch (error) {
      logError("sign_up", error);
      return { error: formatAppError(error) };
    }
  }, []);

  const updateProfile = useCallback(async (input: { name?: string; email?: string }) => {
    try {
      await updateAccountProfile(input);
      return { error: null };
    } catch (error) {
      logError("update_profile", error);
      return { error: formatAppError(error) };
    }
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    if (currentPassword === newPassword) {
      return { error: translate("errorNewPasswordDifferent") };
    }

    try {
      await unregisterPushDevice();
      await changeAccountPassword(currentPassword, newPassword);
      return { error: null };
    } catch (error) {
      logError("change_password", error);
      return { error: formatAppError(error) };
    }
  }, []);

  const deleteAccount = useCallback(async (password: string) => {
    try {
      await unregisterPushDevice();
      await removeAccount(password);
      return { error: null };
    } catch (error) {
      if (error instanceof ApiError && error.code === "CURRENT_PASSWORD_WRONG") {
        return { error: translate("errorDeletePasswordWrong") };
      }
      logError("delete_account", error);
      return { error: formatAppError(error) };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await unregisterPushDevice();
      await endSession();
      return { error: null };
    } catch (error) {
      logError("sign_out", error);
      return { error: formatAppError(error) };
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      signIn,
      signUp,
      updateProfile,
      changePassword,
      deleteAccount,
      signOut,
    }),
    [user, isLoading, signIn, signUp, updateProfile, changePassword, deleteAccount, signOut],
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
