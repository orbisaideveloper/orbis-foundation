import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AuthProvider } from '../../auth/AuthProvider';
import { AuthGuard } from '../../auth/AuthGuard';

describe('Security Foundation (Step-303)', () => {
  it('blocks unauthenticated access', () => {
    render(
      <AuthProvider>
        <AuthGuard>
          <div data-testid="protected-content">Secret System Data</div>
        </AuthGuard>
      </AuthProvider>
    );

    // Initial state is unauthenticated (user is null), so it should show the breach message
    expect(screen.getByText(/SECURITY BREACH/i)).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('allows access to specific roles and blocks others', () => {
    render(
      <AuthProvider>
        {/* Testing with a permission that GUEST role does not have */}
        <AuthGuard requiredPermission="SYSTEM_RESTART">
          <div data-testid="restricted-content">Core Engine Restart</div>
        </AuthGuard>
      </AuthProvider>
    );

    // Should show restricted access message due to insufficient clearance
    expect(screen.getByText(/RESTRICTED/i)).toBeInTheDocument();
    expect(screen.queryByTestId('restricted-content')).not.toBeInTheDocument();
  });
});
