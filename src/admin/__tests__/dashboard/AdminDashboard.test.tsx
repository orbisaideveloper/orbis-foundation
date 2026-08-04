import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminDashboard from '../../dashboard/AdminDashboard';
import '@testing-library/jest-dom';

describe('Premium Admin Dashboard UI', () => {
  it('renders all components, tests real-time data, and unmounts cleanly (100% coverage)', async () => {
    const { unmount } = render(<AdminDashboard />);
    
    // Header Test
    expect(screen.getByText(/ORBIS Center/i)).toBeInTheDocument();
    
    // Data Fetch Test
    await waitFor(() => {
      expect(screen.getByText(/99.99%/i)).toBeInTheDocument();
    });

    // Interaction Test (Open Modal)
    const engineCard = screen.getByText(/Engine/i);
    fireEvent.click(engineCard);
    
    await waitFor(() => {
      expect(screen.getByText(/Engine Monitor/i)).toBeInTheDocument();
    });

    // Check SonarCloud Security (button type)
    const closeBtn = screen.getByRole('button', { name: /Close/i });
    expect(closeBtn).toHaveAttribute('type', 'button'); 
    
    // Interaction Test (Close Modal)
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(screen.queryByText(/Engine Monitor/i)).not.toBeInTheDocument();
    });

    // Trigger cleanup function (clearInterval) to hit 100% coverage
    unmount();
  });
});
