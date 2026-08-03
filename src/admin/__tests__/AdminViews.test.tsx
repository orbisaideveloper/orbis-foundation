import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardView from '../views/DashboardView';
import { AdminCoreProvider } from '../providers/AdminCoreProvider';

describe('Admin Core Views Scaffold', () => {
  it('renders DashboardView correctly with providers', () => {
    render(
      <MemoryRouter>
        <AdminCoreProvider>
          <DashboardView />
        </AdminCoreProvider>
      </MemoryRouter>
    );
    // Checking for the header in DashboardView
    expect(screen.getByText(/ORBIS COMMAND CENTER/i)).toBeInTheDocument();
  });
});
