import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import { AdminDashboard } from '../../dashboard/AdminDashboard';

describe('Admin Dashboard UI (Step-307)', () => {
  it('renders dashboard with aggregated state successfully', () => {
    render(<AdminDashboard />);

    // ১. হেডার চেক করা
    expect(screen.getByText(/ORBIS/i)).toBeInTheDocument();
    expect(screen.getByText(/Cockpit/i)).toBeInTheDocument();
    expect(screen.getByText(/Status: SECURE/i)).toBeInTheDocument();

    // ২. মডিউলার সেকশনগুলো রেন্ডার হয়েছে কি না চেক করা
    expect(screen.getByText(/System Overview/i)).toBeInTheDocument();
    expect(screen.getByText(/Engine Status/i)).toBeInTheDocument();
    expect(screen.getByText(/Brain Status/i)).toBeInTheDocument();
    expect(screen.getByText(/Installed Modules/i)).toBeInTheDocument();

    // ৩. Coming Soon ব্যাজগুলো চেক করা
    const pendingBadges = screen.getAllByText(/Module Pending/i);
    expect(pendingBadges.length).toBeGreaterThan(0);
  });
});
