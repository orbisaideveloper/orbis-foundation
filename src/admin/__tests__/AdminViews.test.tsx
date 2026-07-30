import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DashboardView from '../views/DashboardView';
import ReleaseManagerView from '../views/ReleaseManagerView';
import SystemHealthView from '../views/SystemHealthView';

describe('Admin Core Views Scaffold', () => {
  it('renders DashboardView correctly', () => {
    render(<DashboardView />);
    expect(screen.getByText(/Platform Overview/i)).toBeDefined();
    expect(screen.getByText(/Engine Status/i)).toBeDefined();
  });

  it('renders ReleaseManagerView correctly', () => {
    render(<ReleaseManagerView />);
    expect(screen.getByText(/Release & Version Management/i)).toBeDefined();
    expect(screen.getByText(/Master Approval Gateway/i)).toBeDefined();
    expect(screen.getByText(/Current Public Version/i)).toBeDefined();
    expect(screen.getByText(/Candidate Version/i)).toBeDefined();
  });

  it('renders SystemHealthView correctly', () => {
    render(<SystemHealthView />);
    expect(screen.getByText(/System Health & Diagnostics/i)).toBeDefined();
  });
});
