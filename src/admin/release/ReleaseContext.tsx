import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';
import { ReleaseVersion, ReleaseContextType, ReleaseStatus } from './types';

const ReleaseContext = createContext<ReleaseContextType | undefined>(undefined);

export const ReleaseProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentRelease, setCurrentRelease] = useState<ReleaseVersion | null>(null);

  const initiateDraft = useCallback((versionNumber: string, changes: string[]) => {
    setCurrentRelease({
      id: `rel_${Date.now()}`,
      versionNumber,
      status: 'DRAFT',
      changes,
      updatedAt: Date.now()
    });
  }, []);

  const updateReleaseStatus = useCallback((id: string, newStatus: ReleaseStatus) => {
    setCurrentRelease(prev => {
      // SonarCloud Fix: Using optional chaining for cleaner code
      if (prev?.id === id) {
        return { ...prev, status: newStatus, updatedAt: Date.now() };
      }
      return prev;
    });
  }, []);

  const approveRelease = useCallback((id: string) => {
    updateReleaseStatus(id, 'APPROVED');
  }, [updateReleaseStatus]);

  const publishRelease = useCallback((id: string) => {
    updateReleaseStatus(id, 'PUBLISHED');
  }, [updateReleaseStatus]);

  const rollbackRelease = useCallback((id: string) => {
    updateReleaseStatus(id, 'ROLLED_BACK');
  }, [updateReleaseStatus]);

  // Memoize value to prevent SonarCloud Code Smell
  const contextValue = useMemo(() => ({
    currentRelease,
    approveRelease,
    publishRelease,
    rollbackRelease,
    initiateDraft
  }), [currentRelease, approveRelease, publishRelease, rollbackRelease, initiateDraft]);

  return (
    <ReleaseContext.Provider value={contextValue}>
      {children}
    </ReleaseContext.Provider>
  );
};

export const useRelease = (): ReleaseContextType => {
  const context = useContext(ReleaseContext);
  if (context === undefined) {
    throw new Error('useRelease must be used within a ReleaseProvider');
  }
  return context;
};
