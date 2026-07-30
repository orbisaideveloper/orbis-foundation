import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { AdminRole } from './types';

interface AuthGuardProps {
  allowedRoles?: AdminRole[];
}

const AuthGuard: React.FC<AuthGuardProps> = ({ allowedRoles }) => {
  const { isAuthenticated, hasRole } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0 && !hasRole(allowedRoles)) {
    // Redirect to a generic safe place if not authorized for this specific view
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <Outlet />;
};

export default AuthGuard;
