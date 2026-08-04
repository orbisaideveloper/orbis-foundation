import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminDashboard from '../../dashboard/AdminDashboard';
import '@testing-library/jest-dom';

describe('Admin Dashboard UI (Real Data Scalable Grid)', () => {
  it('renders all original dashboard cards successfully', async () => {
    render(<AdminDashboard />);

    expect(screen.getByText(/System Overview/i)).toBeInTheDocument();
    expect(screen.getByText(/Engine Monitor/i)).toBeInTheDocument();
    expect(screen.getByText(/System Health/i)).toBeInTheDocument();
    expect(screen.getByText(/Brain Monitor/i)).toBeInTheDocument();
    expect(screen.getByText(/AI Providers/i)).toBeInTheDocument();
    expect(screen.getByText(/Runtime Env/i)).toBeInTheDocument();
    expect(screen.getByText(/Release Manager/i)).toBeInTheDocument();
    expect(screen.getByText(/Core Modules/i)).toBeInTheDocument();
  });

  it('opens detailed view on card click', async () => {
    render(<AdminDashboard />);
    
    const engineCard = screen.getByText(/Engine Monitor/i);
    fireEvent.click(engineCard);
    
    await waitFor(() => {
      expect(screen.getByText(/engine DETAILS/i)).toBeInTheDocument();
    });
    
    const closeBtn = screen.getByText(/BACK TO HUB/i);
    fireEvent.click(closeBtn);
  });
});
