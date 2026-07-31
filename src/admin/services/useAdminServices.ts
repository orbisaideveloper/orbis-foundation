import { useAuth } from '../auth/AuthProvider';
import { useRuntime } from '../runtime/RuntimeContext';
import { useRelease } from '../release/ReleaseContext';
import { IAdminService } from '../../contracts/admin.contracts';

export const useAdminServices = (): IAdminService => {
  const auth = useAuth();
  const runtime = useRuntime();
  const release = useRelease();

  return {
    auth,
    runtime,
    release,
  };
};
