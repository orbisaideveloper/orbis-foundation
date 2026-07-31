import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import App from './App';

describe('App Component', () => {
  it('renders the ORBIS TERMINAL heading', () => {
    render(<App />);
    const headingElement = screen.getByText(/ORBIS TERMINAL/i);
    expect(headingElement).toBeInTheDocument();
  });
});
