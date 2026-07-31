import React from 'react';
import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useAdminServices } from '../../services/useAdminServices';
import { AdminCoreProvider } from '../../providers/AdminCoreProvider';

describe('Admin Service Layer (Step-401)', () => {
  it('aggregates all core providers into a single IAdminService facade', () => {
    // Wrap the hook in our robust AdminCoreProvider chain
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AdminCoreProvider>{children}</AdminCoreProvider>
    );

    const { result } = renderHook(() => useAdminServices(), { wrapper });

    // Verify all domain services are successfully aggregated
    expect(result.current).toHaveProperty('auth');
    expect(result.current).toHaveProperty('runtime');
    expect(result.current).toHaveProperty('release');

    // Verify the data flows correctly (checking default Auth state)
    expect(result.current.auth.isAuthenticated).toBe(false);
    expect(result.current.auth.role).toBe('GUEST');
  });
});
