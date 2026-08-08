import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useMemo,
  useCallback,
} from "react";

export interface IReleaseService {
  activeVersion: string;
  rollback: (version: string) => void;
}

const ReleaseContext = createContext<IReleaseService | undefined>(undefined);

export const ReleaseProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [activeVersion, setActiveVersion] = useState("v1.0.0-phase03");

  const rollback = useCallback((version: string) => {
    setActiveVersion(version);
  }, []);

  const value = useMemo(
    () => ({
      activeVersion,
      rollback,
    }),
    [activeVersion, rollback],
  );

  return (
    <ReleaseContext.Provider value={value}>{children}</ReleaseContext.Provider>
  );
};

export const useRelease = () => {
  const context = useContext(ReleaseContext);
  if (!context)
    throw new Error("useRelease must be used within a ReleaseProvider");
  return context;
};
