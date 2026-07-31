import React from 'react';
import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useAdminServices } from '../../services/useAdminServices';
import { AdminCoreProvider } from '../../providers/AdminCoreProvider';

describe('Admin Service Layer (Step-401)', () => {
  it('aggregates all core providers into a structured state/actions facade', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AdminCoreProvider>{children}</AdminCoreProvider>
    );

    const { result } = renderHook(() => useAdminServices(), { wrapper });

    // Verify the correct structure
    expect(result.current).toHaveProperty('state');
    expect(result.current).toHaveProperty('actions');

    // Verify default authentication state mapping
    expect(result.current.state.isAuthenticated).toBe(false);
    expect(result.current.state.role).toBe('GUEST');
    
    // Verify actions mapping
    expect(typeof result.current.actions.login).toBe('function');
    expect(typeof result.current.actions.logout).toBe('function');
  });
});
