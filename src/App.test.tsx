import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';
import '@testing-library/jest-dom';
import CommandBar from './components/CommandCenter/CommandBar';


describe('App Component', () => {
  it('renders the application correctly', async () => {
    render(<App />);
    expect(await screen.findByText(/ORBIS Center/i)).toBeInTheDocument();
  });
});
