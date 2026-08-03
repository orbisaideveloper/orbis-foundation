import { render, screen } from '@testing-library/react';
import App from './App';

describe('App Component', () => {
  it('renders the application correctly', () => {
    render(<App />);
    // By default it redirects to dashboard which shows "SYSTEM LOCKED"
    expect(screen.getByText(/SYSTEM LOCKED/i)).toBeInTheDocument();
  });
});
