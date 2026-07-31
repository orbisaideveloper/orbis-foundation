import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import '@testing-library/jest-dom'; // <-- This is the missing import
import { AdminDashboard } from '../../dashboard/AdminDashboard';
import * as useAdminServicesModule from '../../services/useAdminServices';

vi.mock('../../services/useAdminServices', () => ({
  useAdminServices: vi.fn(),
}));

describe('Admin Dashboard UI (Step-307)', () => {
  it('renders dashboard with aggregated state successfully', () => {
    vi.spyOn(useAdminServicesModule, 'useAdminServices').mockReturnValue({
      state: {
        user: 'sys-admin',
        role: 'ADMIN',
        isAuthenticated: true,
        systemHealth: 'STABLE',
        runtimeMetrics: { cpu: 12, memory: 45 },
        activeRelease: 'v1.0.0-phase03',
      },
      actions: {
        login: vi.fn(),
        logout: vi.fn(),
        hasPermission: vi.fn().mockReturnValue(true),
        triggerRestart: vi.fn(),
        rollback: vi.fn(),
      },
    } as any);

    render(<AdminDashboard />);
    
    expect(screen.getByText(/ORBIS COMMAND CENTER/i)).toBeInTheDocument();
    expect(screen.getByText(/sys-admin/i)).toBeInTheDocument();
    expect(screen.getByText(/GRANTED/i)).toBeInTheDocument();
  });
});
