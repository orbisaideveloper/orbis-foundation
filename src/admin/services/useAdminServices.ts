// @ts-nocheck
import { useAuth } from '../auth/AuthProvider';
import { useRuntime } from '../runtime/RuntimeContext';
import { useRelease } from '../release/ReleaseContext';
import { IAdminService } from '../../contracts/admin.contracts';

export const useAdminServices = (): IAdminService => {
  const auth = useAuth();
  const runtime = useRuntime();
  const release = useRelease();

  return {
    state: {
      user: auth.user,
      role: auth.role,
      isAuthenticated: auth.isAuthenticated,
      systemHealth: runtime.systemHealth,
      runtimeMetrics: runtime.metrics,
      activeRelease: release.activeVersion,
    },
    actions: {
      login: auth.login,
      logout: auth.logout,
      hasPermission: auth.hasPermission,
      triggerRestart: runtime.triggerRestart,
      rollback: release.rollback,
    }
  };
};
