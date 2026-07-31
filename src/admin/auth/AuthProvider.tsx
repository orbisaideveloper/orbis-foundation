import React, { createContext, useContext, useState, ReactNode } from 'react';
import { IAuthService, Role } from '../../contracts/admin.contracts';
import { checkPermission } from './permissions';

const AuthContext = createContext<IAuthService | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Initial state as GUEST. Zero Mock Data rule applied.
  const [user, setUser] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('GUEST');

  const login = (token: string) => {
    // TODO: Decode JWT token later. Setting basic state for architecture validation.
    setUser('sys-admin');
    setRole('ADMIN');
  };

  const logout = () => {
    setUser(null);
    setRole('GUEST');
  };

  const hasPermission = (permissionId: string): boolean => {
    return checkPermission(role, permissionId);
  };

  const value: IAuthService = {
    user,
    role,
    isAuthenticated: !!user,
    login,
    logout,
    hasPermission
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): IAuthService => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
