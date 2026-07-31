import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

describe('App Component', () => {
  it('renders the ORBIS TERMINAL heading', () => {
    render(<App />);
    // Using getAllByText to safely grab the first occurrence if multiple exist
    const headings = screen.getAllByText(/ORBIS TERMINAL/i);
    expect(headings[0]).toBeInTheDocument();
  });
});
