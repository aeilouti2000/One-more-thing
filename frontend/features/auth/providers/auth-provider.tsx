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
  linkGoogle as linkGoogleAccount,
  requestPasswordReset as sendResetCode,
  resendEmailCode as resendCode,
  resetPassword as resetAccountPassword,
  setEmail as setAccountEmail,
  signInWithGoogle as googleSignIn,
  signOut as endSession,
  signUp as register,
  unlinkGoogle as unlinkGoogleAccount,
  updateProfile as updateAccountProfile,
  verifyEmail as verifyAccountEmail,
  type AuthUser,
} from "@/lib/api";
import {
  getGoogleIdToken,
  type GoogleTokenResult,
} from "@/features/auth/lib/google-sign-in";
import { formatAppError, logError } from "@/lib/errors";
import { unregisterPushDevice } from "@/features/notifications/api/push";

void SplashScreen.preventAutoHideAsync();

type AuthResult = {
  error: string | null;
};

/** `cancelled`: the person closed Google's picker; show nothing. */
type GoogleResult = AuthResult & { cancelled?: boolean };

function googleError(
  result: Exclude<GoogleTokenResult, { type: "success" }>,
): GoogleResult {
  if (result.type === "cancelled") return { error: null, cancelled: true };
  if (result.code === "unavailable")
    return { error: translate("googleUnavailable") };
  if (result.code === "play_services")
    return { error: translate("errorPlayServices") };
  return { error: translate("errorGoogleFailed") };
}

async function attempt(
  scope: string,
  run: () => Promise<unknown>,
): Promise<AuthResult> {
  try {
    await run();
    return { error: null };
  } catch (error) {
    logError(scope, error);
    return { error: formatAppError(error) };
  }
}

async function withGoogle(
  scope: string,
  run: (idToken: string) => Promise<unknown>,
): Promise<GoogleResult> {
  const token = await getGoogleIdToken();
  if (token.type !== "success") return googleError(token);
  return attempt(scope, () => run(token.idToken));
}

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (
    name: string,
    username: string,
    password: string,
    email: string,
  ) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<GoogleResult>;
  linkGoogle: () => Promise<GoogleResult>;
  unlinkGoogle: () => Promise<AuthResult>;
  setEmail: (email: string) => Promise<AuthResult>;
  resendEmailCode: () => Promise<AuthResult>;
  verifyEmail: (code: string) => Promise<AuthResult>;
  requestPasswordReset: (login: string) => Promise<AuthResult>;
  resetPassword: (
    login: string,
    code: string,
    newPassword: string,
  ) => Promise<AuthResult>;
  updateProfile: (input: {
    name?: string;
    email?: string;
  }) => Promise<AuthResult>;
  /** Omit `currentPassword` to set a first password on a Google-only account. */
  changePassword: (
    currentPassword: string | undefined,
    newPassword: string,
  ) => Promise<AuthResult>;
  deleteAccount: (password: string) => Promise<AuthResult>;
  deleteAccountWithGoogle: () => Promise<GoogleResult>;
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

  const signUp = useCallback(
    (name: string, username: string, password: string, email: string) =>
      attempt("sign_up", () =>
        register(name.trim(), username.trim(), password, email.trim()),
      ),
    [],
  );

  const signInWithGoogle = useCallback(
    () => withGoogle("google_sign_in", (idToken) => googleSignIn(idToken)),
    [],
  );
  const linkGoogle = useCallback(
    () => withGoogle("google_link", (idToken) => linkGoogleAccount(idToken)),
    [],
  );
  const unlinkGoogle = useCallback(
    () => attempt("google_unlink", unlinkGoogleAccount),
    [],
  );
  const setEmail = useCallback(
    (email: string) =>
      attempt("set_email", () => setAccountEmail(email.trim())),
    [],
  );
  const resendEmailCode = useCallback(
    () => attempt("resend_code", resendCode),
    [],
  );
  const verifyEmail = useCallback(
    (code: string) =>
      attempt("verify_email", () => verifyAccountEmail(code.trim())),
    [],
  );
  const requestPasswordReset = useCallback(
    (login: string) =>
      attempt("forgot_password", () => sendResetCode(login.trim())),
    [],
  );
  const resetPassword = useCallback(
    (login: string, code: string, newPassword: string) =>
      attempt("reset_password", () =>
        resetAccountPassword(login.trim(), code.trim(), newPassword),
      ),
    [],
  );

  const updateProfile = useCallback(
    async (input: { name?: string; email?: string }) => {
      try {
        await updateAccountProfile(input);
        return { error: null };
      } catch (error) {
        logError("update_profile", error);
        return { error: formatAppError(error) };
      }
    },
    [],
  );

  const changePassword = useCallback(
    async (currentPassword: string | undefined, newPassword: string) => {
      if (currentPassword === newPassword) {
        return { error: translate("errorNewPasswordDifferent") };
      }

      try {
        // Setting a first password keeps the session (and its push device).
        if (currentPassword !== undefined) await unregisterPushDevice();
        await changeAccountPassword(currentPassword, newPassword);
        return { error: null };
      } catch (error) {
        logError("change_password", error);
        return { error: formatAppError(error) };
      }
    },
    [],
  );

  const deleteAccount = useCallback(async (password: string) => {
    try {
      await unregisterPushDevice();
      await removeAccount({ password });
      return { error: null };
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === "CURRENT_PASSWORD_WRONG"
      ) {
        return { error: translate("errorDeletePasswordWrong") };
      }
      logError("delete_account", error);
      return { error: formatAppError(error) };
    }
  }, []);

  const deleteAccountWithGoogle = useCallback(async () => {
    const token = await getGoogleIdToken();
    if (token.type !== "success") return googleError(token);
    return attempt("delete_account", async () => {
      await unregisterPushDevice();
      await removeAccount({ googleIdToken: token.idToken });
    });
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
      signInWithGoogle,
      linkGoogle,
      unlinkGoogle,
      setEmail,
      resendEmailCode,
      verifyEmail,
      requestPasswordReset,
      resetPassword,
      updateProfile,
      changePassword,
      deleteAccount,
      deleteAccountWithGoogle,
      signOut,
    }),
    [
      user,
      isLoading,
      signIn,
      signUp,
      signInWithGoogle,
      linkGoogle,
      unlinkGoogle,
      setEmail,
      resendEmailCode,
      verifyEmail,
      requestPasswordReset,
      resetPassword,
      updateProfile,
      changePassword,
      deleteAccount,
      deleteAccountWithGoogle,
      signOut,
    ],
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
