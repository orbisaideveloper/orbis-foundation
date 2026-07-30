import { useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useRuntime } from '../runtime/RuntimeContext';
import { useRelease } from '../release/ReleaseContext';

export const useAdminServices = () => {
  const auth = useAuth();
  const runtime = useRuntime();
  const release = useRelease();

  // Aggregate state to serve as a unified stable service layer for the UI
  const dashboardState = useMemo(() => ({
    user: auth.user,
    isAuthenticated: auth.isAuthenticated,
    runtimeMetrics: runtime.metrics,
    systemHealth: {
      engine: runtime.engineStatus,
      brain: runtime.brainStatus,
      overall: runtime.healthStatus,
    },
    activeRelease: release.currentRelease,
  }), [
    auth.user, 
    auth.isAuthenticated, 
    runtime.metrics, 
    runtime.engineStatus, 
    runtime.brainStatus, 
    runtime.healthStatus, 
    release.currentRelease
  ]);

  // Aggregate actions to prevent business logic bleeding into UI views
  const dashboardActions = useMemo(() => ({
    logout: auth.logout,
    initiateReleaseDraft: release.initiateDraft,
    approveRelease: release.approveRelease,
    publishRelease: release.publishRelease,
    rollbackRelease: release.rollbackRelease,
  }), [
    auth.logout, 
    release.initiateDraft, 
    release.approveRelease, 
    release.publishRelease, 
    release.rollbackRelease
  ]);

  return { state: dashboardState, actions: dashboardActions };
};
