import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminDashboard from '../../dashboard/AdminDashboard';
import '@testing-library/jest-dom';

describe('Admin Dashboard UI (Real Data & Coverage Fix)', () => {
  it('renders compact header, displays real-time data and unmounts cleanly', async () => {
    // unmount যুক্ত করা হলো যাতে useEffect-এর cleanup (clearInterval) কভার হয়
    const { unmount } = render(<AdminDashboard />);
    expect(screen.getByText(/ORBIS Admin Center/i)).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText(/PHASE 04/i)).toBeInTheDocument();
    });

    unmount(); // Coverage restore!
  });

  it('opens and closes modal successfully resolving SonarCloud button type', async () => {
    render(<AdminDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText(/PHASE 04/i)).toBeInTheDocument();
    });
    
    const engineCard = screen.getByText(/Engine Monitor/i);
    fireEvent.click(engineCard);
    
    await waitFor(() => {
      expect(screen.getByText(/engine DETAILS/i)).toBeInTheDocument();
    });
    
    const closeBtn = screen.getByRole('button', { name: /BACK TO HUB/i });
    expect(closeBtn).toHaveAttribute('type', 'button'); 
    
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(screen.queryByText(/engine DETAILS/i)).not.toBeInTheDocument();
    });
  });
});
