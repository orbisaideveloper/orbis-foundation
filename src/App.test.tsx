import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';
import '@testing-library/jest-dom';

describe('App Component', () => {
  it('renders the ORBIS Foundation heading', () => {
    render(<App />);
    const headingElement = screen.getByText(/ORBIS Foundation/i);
    expect(headingElement).toBeInTheDocument();
  });
});

