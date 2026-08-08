import React, { ReactNode } from "react";
import { AuthProvider } from "../auth/AuthContext";
import { RuntimeProvider } from "../runtime/RuntimeContext";
import { ReleaseProvider } from "../release/ReleaseContext";

export const AdminCoreProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  return (
    <AuthProvider>
      <RuntimeProvider>
        <ReleaseProvider>{children}</ReleaseProvider>
      </RuntimeProvider>
    </AuthProvider>
  );
};
