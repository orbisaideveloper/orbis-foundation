import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App Component', () => {
  it('renders the application correctly', async () => {
    render(<App />);
    // Layout header is rendered immediately, or wait for it
    expect(await screen.findByText(/ORBIS Admin Command Center/i)).toBeInTheDocument();
  });
});
