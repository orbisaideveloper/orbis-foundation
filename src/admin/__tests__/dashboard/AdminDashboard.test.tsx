import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AdminDashboard from '../../dashboard/AdminDashboard';
import '@testing-library/jest-dom';

describe('Admin Dashboard UI (Bento Box)', () => {
  it('renders dashboard with new Bento layout successfully', () => {
    render(<AdminDashboard />);

    // Check all new Bento Box cards are present
    expect(screen.getByText(/Engine Status/i)).toBeInTheDocument();
    expect(screen.getByText(/RAM Usage/i)).toBeInTheDocument();
    expect(screen.getByText(/Brain Sync/i)).toBeInTheDocument();
    expect(screen.getByText(/Architecture/i)).toBeInTheDocument();

    // Check key metrics
    expect(screen.getByText(/ONLINE/i)).toBeInTheDocument();
    expect(screen.getByText(/42%/i)).toBeInTheDocument();
    expect(screen.getByText(/99.9%/i)).toBeInTheDocument();
    expect(screen.getByText(/PHASE 04/i)).toBeInTheDocument();
  });

  it('opens details modal when a card is clicked', () => {
    render(<AdminDashboard />);
    
    // Click on the Engine Status card
    const engineCard = screen.getByText(/Engine Status/i);
    fireEvent.click(engineCard);
    
    // Expect the modal details to appear
    expect(screen.getByText(/Engine is running flawlessly/i)).toBeInTheDocument();
    
    // Close the modal
    const closeBtn = screen.getByText(/Close Detail/i);
    fireEvent.click(closeBtn);
  });
});
