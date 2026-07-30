import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';
import { AdminRole, AdminUser, AuthSession } from './types';
import { AuditLogger } from './AuditLogger';

interface AuthState extends AuthSession {
  login: (user: AdminUser) => void;
  logout: () => void;
  hasRole: (allowedRoles: AdminRole[]) => boolean;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<AuthSession>({
    user: null,
    isAuthenticated: false,
    loginTime: null
  });

  const login = useCallback((user: AdminUser) => {
    setSession({ user, isAuthenticated: true, loginTime: Date.now() });
    AuditLogger.logEvent('LOGIN_SUCCESS', user.id, { role: user.role });
  }, []);

  const logout = useCallback(() => {
    if (session.user) {
      AuditLogger.logEvent('LOGOUT', session.user.id);
    }
    setSession({ user: null, isAuthenticated: false, loginTime: null });
  }, [session.user]);

  const hasRole = useCallback((allowedRoles: AdminRole[]) => {
    if (!session.user) return false;
    if (session.user.role === AdminRole.SUPER_ADMIN) return true; // Super Admin has all access
    return allowedRoles.includes(session.user.role);
  }, [session.user]);

  // SonarCloud Fix: Memoize the context value for performance
  const contextValue = useMemo(() => ({
    ...session,
    login,
    logout,
    hasRole
  }), [session, login, logout, hasRole]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthState => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
