import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useMemo,
  useCallback,
} from "react";
import { IAuthService, Role } from "../../contracts/admin.contracts";
import { checkPermission } from "./permissions";

// Exporting context to ensure other files can access the exact same instance if needed
export const AuthContext = createContext<IAuthService | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("GUEST");

  const login = useCallback((token: string) => {
    setUser("sys-admin");
    setRole("ADMIN");
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setRole("GUEST");
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
      isAuthenticated: !!user,
      login,
      logout,
      hasPermission,
    }),
    [user, role, login, logout, hasPermission],
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
