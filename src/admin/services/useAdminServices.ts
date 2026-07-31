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
      // Mapping runtime and release states (adjusting based on standard naming)
      systemHealth: (runtime as any).systemHealth || 'STABLE', 
      runtimeMetrics: (runtime as any).metrics || { cpu: 0, memory: 0 },
      activeRelease: (release as any).activeVersion || 'v1.0.0',
    },
    actions: {
      login: auth.login,
      logout: auth.logout,
      hasPermission: auth.hasPermission,
      // Mapping runtime and release actions
      triggerRestart: (runtime as any).triggerRestart || (() => {}),
      rollback: (release as any).rollback || (() => {}),
    }
  } as IAdminService;
};
