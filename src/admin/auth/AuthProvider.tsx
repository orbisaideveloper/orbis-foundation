import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useMemo,
  useCallback,
  useEffect,
} from "react";
import { IAuthService, Role } from "../../contracts/admin.contracts";
import { isSupabaseConfigured, supabase } from "../../core/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { checkAdminAccess } from "./adminFetch";
import { checkPermission } from "./permissions";

// Exporting context to ensure other files can access the exact same instance if needed
export const AuthContext = createContext<IAuthService | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("GUEST");
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

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

      const sessionUser = session.user.email || session.user.id;
      setUser(sessionUser);
      setRole("GUEST");

      const access = await checkAdminAccess(session.access_token);
      if (!active || currentVerification !== verificationId) return;

      if (access === "ADMIN") {
        setRole("ADMIN");
      } else if (access === "ACCESS_DENIED") {
        setAuthError("This account does not have Admin access.");
      } else if (access === "INVALID_SESSION") {
        setUser(null);
        setAuthError("Your session is invalid or expired. Please sign in again.");
        await supabase.auth.signOut();
        if (!active || currentVerification !== verificationId) return;
      } else {
        setAuthError("Admin access could not be verified.");
      }

      setIsLoading(false);
    };

    if (!isSupabaseConfigured) {
      setUser(null);
      setRole("GUEST");
      setAuthError("Admin authentication is not configured.");
      setIsLoading(false);
      return () => {
        active = false;
      };
    }

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        return applySession(data.session);
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setRole("GUEST");
        setAuthError("Admin authentication is unavailable.");
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
  }, []);

  const login = useCallback(async (email: string, password?: string) => {
    setAuthError(null);
    if (!isSupabaseConfigured) {
      setAuthError("Admin authentication is not configured.");
      return;
    }
    if (!email.trim() || !password) {
      setAuthError("Email and password are required.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) setAuthError("Unable to sign in with those credentials.");
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
      authError,
      login,
      logout,
      hasPermission,
    }),
    [user, role, isLoading, authError, login, logout, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): IAuthService => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
