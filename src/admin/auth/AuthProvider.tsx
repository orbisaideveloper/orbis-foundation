import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { IAuthService, Role } from "../../contracts/admin.contracts";
import {
  adminEmail,
  isAdminAuthConfigured,
  supabase,
} from "../../core/supabase/client";
import type { AuthError, Session } from "@supabase/supabase-js";
import { checkAdminAccess, type AdminAccessResult } from "./adminFetch";
import { checkPermission } from "./permissions";

const ADMIN_AUTH_NOT_CONFIGURED = "Admin authentication is not configured.";
const ADMIN_AUTH_UNAVAILABLE = "Admin authentication is unavailable.";
const ADMIN_SESSION_TIMEOUT =
  "Admin session verification took too long. Please retry.";
const ADMIN_ACCESS_TIMEOUT =
  "Admin access verification took too long. Please retry.";
export const ADMIN_SESSION_TIMEOUT_MS = 10_000;
const INVALID_CREDENTIALS = "Unable to sign in with those credentials.";
const VERIFY_ADMIN_EMAIL = "Verify the Admin email before signing in.";
const ADMIN_ACCESS_ERROR_MESSAGES: Record<
  Exclude<AdminAccessResult, "ADMIN" | "INVALID_SESSION">,
  string
> = {
  ACCESS_DENIED: "This account does not have Admin access.",
  CONFIGURATION_MISSING: ADMIN_AUTH_NOT_CONFIGURED,
  EMAIL_UNVERIFIED: VERIFY_ADMIN_EMAIL,
  TIMEOUT: ADMIN_ACCESS_TIMEOUT,
  UNAVAILABLE: "Admin access could not be verified.",
};

class AdminSessionTimeoutError extends Error {
  constructor() {
    super("ADMIN_SESSION_TIMEOUT");
    this.name = "AdminSessionTimeoutError";
  }
}

function withSessionTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: number | undefined;

  return Promise.race([
    operation,
    new Promise<T>((_, reject) => {
      timer = window.setTimeout(
        () => reject(new AdminSessionTimeoutError()),
        ADMIN_SESSION_TIMEOUT_MS,
      );
    }),
  ]).finally(() => {
    if (timer !== undefined) window.clearTimeout(timer);
  });
}

// Exporting context to ensure other files can access the exact same instance if needed
export const AuthContext = createContext<IAuthService | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("GUEST");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signupStatus, setSignupStatus] = useState<
    "IDLE" | "CONFIRMATION_SENT" | "ALREADY_REGISTERED"
  >("IDLE");
  const [sessionCheckAttempt, setSessionCheckAttempt] = useState(0);
  const accountCreationPending = useRef(false);

  useEffect(() => {
    let active = true;
    let verificationId = 0;

    const applySession = async (session: Session | null) => {
      const currentVerification = ++verificationId;
      if (!active) return;

      setIsLoading(true);
      setAuthError(null);

      if (!session) {
        setUser(null);
        setRole("GUEST");
        setIsLoading(false);
        return;
      }

      if (accountCreationPending.current) {
        setUser(null);
        setRole("GUEST");
        setIsLoading(false);
        void supabase.auth.signOut();
        return;
      }

      const sessionUser = session.user.email || session.user.id;
      setUser(sessionUser);
      setRole("GUEST");

      const access = await checkAdminAccess(session.access_token);
      if (!active || currentVerification !== verificationId) return;

      if (access === "ADMIN") {
        setRole("ADMIN");
      } else if (access === "INVALID_SESSION") {
        setUser(null);
        setAuthError(
          "Your session is invalid or expired. Please sign in again.",
        );
        await supabase.auth.signOut();
        if (!active || currentVerification !== verificationId) return;
      } else {
        setAuthError(ADMIN_ACCESS_ERROR_MESSAGES[access]);
      }

      setIsLoading(false);
    };

    if (!isAdminAuthConfigured) {
      setUser(null);
      setRole("GUEST");
      setAuthError(ADMIN_AUTH_NOT_CONFIGURED);
      setIsLoading(false);
      return () => {
        active = false;
      };
    }

    void withSessionTimeout(supabase.auth.getSession())
      .then(({ data, error }) => {
        if (error) throw error;
        return applySession(data.session);
      })
      .catch((error) => {
        if (!active) return;
        setUser(null);
        setRole("GUEST");
        setAuthError(
          error instanceof AdminSessionTimeoutError
            ? ADMIN_SESSION_TIMEOUT
            : ADMIN_AUTH_UNAVAILABLE,
        );
        setIsLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        void applySession(session);
      },
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [sessionCheckAttempt]);

  const retryAdminSession = useCallback(() => {
    setSessionCheckAttempt((attempt) => attempt + 1);
  }, []);

  const login = useCallback(async (email: string, password?: string) => {
    setAuthError(null);
    setSignupStatus("IDLE");
    if (!isAdminAuthConfigured || !adminEmail) {
      setAuthError(ADMIN_AUTH_NOT_CONFIGURED);
      return;
    }
    if (!email.trim() || !password) {
      setAuthError("Email and password are required.");
      return;
    }
    if (email.trim() !== adminEmail) {
      setAuthError(INVALID_CREDENTIALS);
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setAuthError(
          error.code === "email_not_confirmed"
            ? VERIFY_ADMIN_EMAIL
            : INVALID_CREDENTIALS,
        );
      }
    } catch {
      setAuthError(ADMIN_AUTH_UNAVAILABLE);
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const createAdminAccount = useCallback(
    async (password: string, passwordConfirmation: string) => {
      setAuthError(null);
      setSignupStatus("IDLE");

      if (!isAdminAuthConfigured || !adminEmail) {
        setAuthError(ADMIN_AUTH_NOT_CONFIGURED);
        return;
      }
      if (password !== passwordConfirmation) {
        setAuthError("Passwords do not match.");
        return;
      }
      if (password.length < 8) {
        setAuthError("Use a password with at least 8 characters.");
        return;
      }

      setIsSubmitting(true);
      accountCreationPending.current = true;
      try {
        const { data, error } = await supabase.auth.signUp({
          email: adminEmail,
          password,
        });

        if (error) {
          setAuthError(signupErrorMessage(error));
          if (error.code === "user_already_exists") {
            setSignupStatus("ALREADY_REGISTERED");
          }
          return;
        }

        if (data.user && data.user.identities?.length === 0) {
          setSignupStatus("ALREADY_REGISTERED");
          setAuthError(
            "The Admin account is already registered. Sign in instead.",
          );
          return;
        }

        if (data.session) {
          await supabase.auth.signOut();
          setAuthError(
            "Admin email verification must be enabled in Supabase before account creation.",
          );
          return;
        }

        setSignupStatus("CONFIRMATION_SENT");
      } catch {
        setAuthError(ADMIN_AUTH_UNAVAILABLE);
      } finally {
        accountCreationPending.current = false;
        setIsSubmitting(false);
      }
    },
    [],
  );

  const clearAuthFeedback = useCallback(() => {
    setAuthError(null);
    setSignupStatus("IDLE");
  }, []);

  const logout = useCallback(async () => {
    setAuthError(null);
    setUser(null);
    setRole("GUEST");
    await supabase.auth.signOut();
  }, []);

  const hasPermission = useCallback(
    (permissionId: string): boolean => {
      return checkPermission(role, permissionId);
    },
    [role],
  );

  const value: IAuthService = useMemo(
    () => ({
      user,
      role,
      isAuthenticated: role === "ADMIN",
      isLoading,
      isSubmitting,
      authError,
      signupStatus,
      retryAdminSession,
      login,
      createAdminAccount,
      clearAuthFeedback,
      logout,
      hasPermission,
    }),
    [
      user,
      role,
      isLoading,
      isSubmitting,
      authError,
      signupStatus,
      retryAdminSession,
      login,
      createAdminAccount,
      clearAuthFeedback,
      logout,
      hasPermission,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

function signupErrorMessage(error: AuthError): string {
  if (error.code === "user_already_exists") {
    return "The Admin account is already registered. Sign in instead.";
  }
  if (error.code === "weak_password") {
    return "That password does not meet the Supabase password requirements.";
  }
  return "Unable to create the Admin account. Check the password and try again.";
}

export const useAuth = (): IAuthService => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
