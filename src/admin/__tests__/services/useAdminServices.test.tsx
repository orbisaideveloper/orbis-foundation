import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAdminServices } from '../../services/useAdminServices';
import * as AuthContext from '../../auth/AuthContext';
import * as RuntimeContext from '../../runtime/RuntimeContext';
import * as ReleaseContext from '../../release/ReleaseContext';

// Mock the individual context hooks to strictly isolate and test the service aggregator
vi.mock('../../auth/AuthContext');
vi.mock('../../runtime/RuntimeContext');
vi.mock('../../release/ReleaseContext');

describe('Admin Service Layer (Step-306)', () => {
  it('aggregates state and actions correctly from underlying contexts', () => {
    // 1. Setup mock returns for Auth
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { id: 'usr_1', role: 'ADMIN', name: 'Admin', email: 'admin@orbis.com' },
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    } as any);

    // 2. Setup mock returns for Runtime
    vi.spyOn(RuntimeContext, 'useRuntime').mockReturnValue({
      engineStatus: 'HEALTHY',
      brainStatus: 'HEALTHY',
      healthStatus: 'HEALTHY',
      metrics: { cpuUsage: 15, memoryUsage: 30, activeNodes: 3 },
      lastUpdated: 1620000000,
      updateRuntimeState: vi.fn(),
    } as any);

    // 3. Setup mock returns for Release
    vi.spyOn(ReleaseContext, 'useRelease').mockReturnValue({
      currentRelease: { id: 'rel_1', versionNumber: 'v1.0.0', status: 'DRAFT', changes: [], updatedAt: 0 },
      initiateDraft: vi.fn(),
      approveRelease: vi.fn(),
      publishRelease: vi.fn(),
      rollbackRelease: vi.fn(),
    } as any);

    // Render the custom hook
    const { result } = renderHook(() => useAdminServices());

    // Assert State Aggregation
    expect(result.current.state.isAuthenticated).toBe(true);
    expect(result.current.state.user?.role).toBe('ADMIN');
    expect(result.current.state.systemHealth.engine).toBe('HEALTHY');
    expect(result.current.state.runtimeMetrics.cpuUsage).toBe(15);
    expect(result.current.state.activeRelease?.status).toBe('DRAFT');

    // Assert Actions Availability
    expect(typeof result.current.actions.logout).toBe('function');
    expect(typeof result.current.actions.initiateReleaseDraft).toBe('function');
    expect(typeof result.current.actions.publishRelease).toBe('function');
  });
});
