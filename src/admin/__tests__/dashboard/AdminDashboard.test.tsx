import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminDashboard from '../../dashboard/AdminDashboard';
import '@testing-library/jest-dom';

describe('Admin Dashboard UI (Real Data & Coverage Fix)', () => {
  it('renders compact header and displays real-time data', async () => {
    render(<AdminDashboard />);
    expect(screen.getByText(/ORBIS Admin Center/i)).toBeInTheDocument();
    
    // Initial data fetch হওয়ার জন্য অপেক্ষা করবে
    await waitFor(() => {
      expect(screen.getByText(/PHASE 04/i)).toBeInTheDocument();
    });
  });

  it('opens and closes modal successfully resolving SonarCloud button type', async () => {
    render(<AdminDashboard />);
    
    // কার্ডগুলো পুরোপুরি রেন্ডার হওয়ার জন্য অপেক্ষা করবে
    await waitFor(() => {
      expect(screen.getByText(/PHASE 04/i)).toBeInTheDocument();
    });
    
    const engineCard = screen.getByText(/Engine Monitor/i);
    fireEvent.click(engineCard);
    
    await waitFor(() => {
      expect(screen.getByText(/engine DETAILS/i)).toBeInTheDocument();
    });
    
    // SonarCloud-এর type="button" ফিক্সটা চেক করবে
    const closeBtn = screen.getByRole('button', { name: /BACK TO HUB/i });
    expect(closeBtn).toHaveAttribute('type', 'button'); 
    
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(screen.queryByText(/engine DETAILS/i)).not.toBeInTheDocument();
    });
  });
});
