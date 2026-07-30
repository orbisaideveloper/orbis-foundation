import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { AdminDashboard } from '../../dashboard/AdminDashboard';
import * as AdminServices from '../../services/useAdminServices';

// Mock the service layer to isolate UI tests
vi.mock('../../services/useAdminServices');

describe('Admin Dashboard UI (Step-307)', () => {
  it('renders dashboard with aggregated state successfully', () => {
    vi.spyOn(AdminServices, 'useAdminServices').mockReturnValue({
      state: {
        user: { id: '1', role: 'ADMIN', name: 'ORBIS Commander', email: 'cmd@orbis.com' },
        isAuthenticated: true,
        systemHealth: { engine: 'HEALTHY', brain: 'HEALTHY', overall: 'HEALTHY' },
        runtimeMetrics: { cpuUsage: 25, memoryUsage: 45, activeNodes: 5 },
        activeRelease: null
      },
      actions: {
        logout: vi.fn(),
        initiateReleaseDraft: vi.fn(),
        approveRelease: vi.fn(),
        publishRelease: vi.fn(),
        rollbackRelease: vi.fn()
      }
    } as any);

    render(<AdminDashboard />);
    
    // Assert Headers
    expect(screen.getByText('ORBIS Command Center')).toBeDefined();
    
    // Assert Operator Info
    expect(screen.getByText('ORBIS Commander')).toBeDefined();
    
    // Assert System Health metrics
    expect(screen.getByText('25%')).toBeDefined();
    expect(screen.getByText('45%')).toBeDefined();
    
    // Assert Release Pipeline status
    expect(screen.getByText('NO ACTIVE RELEASE')).toBeDefined();
  });
});
