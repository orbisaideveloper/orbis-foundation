import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import App from './App';

describe('App Component', () => {
  it('renders the application wrapped in routing', () => {
    render(<App />);
    const headings = screen.getAllByText(/ORBIS TERMINAL/i);
    expect(headings[0]).toBeInTheDocument();
  });
});
