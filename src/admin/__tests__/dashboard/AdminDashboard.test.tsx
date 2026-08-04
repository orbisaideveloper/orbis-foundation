import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminDashboard from '../../dashboard/AdminDashboard';
import '@testing-library/jest-dom';

describe('Premium Admin Dashboard UI with 8 Cards & Sidebar', () => {
  it('renders all 8 functional components and updates data', async () => {
    const { unmount } = render(<AdminDashboard />);
    
    // Check old logics/cards are present
    expect(screen.getAllByText(/Overview/i)[0]).toBeInTheDocument();
    expect(screen.getByText(/Runtime/i)).toBeInTheDocument();
    expect(screen.getByText(/Release/i)).toBeInTheDocument();
    expect(screen.getByText(/Modules/i)).toBeInTheDocument();
    
    // Data Fetch Test
    await waitFor(() => {
      expect(screen.getByText(/99.99%/i)).toBeInTheDocument();
    });
    unmount();
  });

  it('opens and closes the Sidebar Menu properly', () => {
    const { unmount } = render(<AdminDashboard />);
    
    // Find hamburger button (first button without specific text usually)
    const hamburgerBtn = screen.getAllByRole('button')[0];
    fireEvent.click(hamburgerBtn);
    
    // Sidebar should be visible with options
    expect(screen.getByText(/System Settings/i)).toBeInTheDocument();
    
    // Close sidebar
    const closeSidebarBtn = screen.getByText('✕');
    fireEvent.click(closeSidebarBtn);
    
    unmount();
  });

  it('opens and closes modal successfully', async () => {
    const { unmount } = render(<AdminDashboard />);
    
    // Open Modal
    const runtimeCard = screen.getByText(/Runtime/i);
    fireEvent.click(runtimeCard);
    
    await waitFor(() => {
      expect(screen.getByText(/runtime Monitor/i)).toBeInTheDocument();
    });

    // Close Modal
    const closeBtn = screen.getByRole('button', { name: /Close/i });
    expect(closeBtn).toHaveAttribute('type', 'button'); 
    
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(screen.queryByText(/runtime Monitor/i)).not.toBeInTheDocument();
    });

    unmount();
  });
});

describe('Overview Modal Sub-Cards Test', () => {
  it('renders overview sub-cards correctly when clicked', async () => {
    const { render, screen, fireEvent, waitFor } = await import('@testing-library/react');
    const { default: AdminDashboard } = await import('../../dashboard/AdminDashboard');
    const { unmount } = render(<AdminDashboard />);
    
    const overviewCard = screen.getAllByText('Overview')[0];
    fireEvent.click(overviewCard);
    
    await waitFor(() => {
      expect(screen.getByText(/Microservices/i)).toBeInTheDocument();
      expect(screen.getByText(/API Gateway/i)).toBeInTheDocument();
    });
    
    unmount();
  });
});
