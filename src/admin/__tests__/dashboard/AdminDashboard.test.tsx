import { render, screen } from '@testing-library/react';
import { AdminDashboard } from '../../dashboard/AdminDashboard';
import { AdminCoreProvider } from '../../providers/AdminCoreProvider';

describe('Admin Dashboard UI (Step-307)', () => {
  it('renders dashboard with aggregated state successfully', () => {
    render(
      <AdminCoreProvider>
        <AdminDashboard />
      </AdminCoreProvider>
    );
    // Initially Unauthenticated, should render SYSTEM LOCKED
    expect(screen.getByText(/SYSTEM LOCKED/i)).toBeInTheDocument();
  });
});
