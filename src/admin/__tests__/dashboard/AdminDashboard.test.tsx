import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import AdminDashboard from '../../dashboard/AdminDashboard';
import '@testing-library/jest-dom';

describe('Admin Dashboard UI (Real Data & Coverage Fix)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('renders compact header and advances timers for real-time data coverage', async () => {
    render(<AdminDashboard />);
    expect(screen.getByText(/ORBIS Admin Center/i)).toBeInTheDocument();
    
    act(() => {
      vi.advanceTimersByTime(6000);
    });

    await waitFor(() => {
      expect(screen.getByText(/PHASE 04/i)).toBeInTheDocument();
    });
  });

  it('opens and closes modal successfully resolving SonarCloud button type', async () => {
    render(<AdminDashboard />);
    
    const engineCard = screen.getByText(/Engine Monitor/i);
    fireEvent.click(engineCard);
    
    await waitFor(() => {
      expect(screen.getByText(/engine DETAILS/i)).toBeInTheDocument();
    });
    
    // Check if the button has the required type="button"
    const closeBtn = screen.getByRole('button', { name: /BACK TO HUB/i });
    expect(closeBtn).toHaveAttribute('type', 'button'); 
    
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(screen.queryByText(/engine DETAILS/i)).not.toBeInTheDocument();
    });
  });
});
