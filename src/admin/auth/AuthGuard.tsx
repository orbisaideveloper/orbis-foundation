import React, { ReactNode } from "react";
import { useAuth } from "./AuthProvider";

interface AuthGuardProps {
  children: ReactNode;
  requiredPermission?: string;
}

export const AuthGuard: React.FC<AuthGuardProps> = ({
  children,
  requiredPermission,
}) => {
  const { isAuthenticated, hasPermission } = useAuth();

  if (!isAuthenticated) {
    return (
      <div className="p-4 text-red-500 font-mono text-sm border border-red-500/30 rounded bg-red-900/10">
        SECURITY BREACH: Access Denied. Identity verification required.
      </div>
    );
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return (
      <div className="p-4 text-yellow-500 font-mono text-sm border border-yellow-500/30 rounded bg-yellow-900/10">
        RESTRICTED: Insufficient clearance level for this operation.
      </div>
    );
  }

  return <>{children}</>;
};
