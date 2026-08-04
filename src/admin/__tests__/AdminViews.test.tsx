import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminViews } from '../AdminViews';
import '@testing-library/jest-dom';

describe('AdminViews Component', () => {
  it('renders Dashboard seamlessly without old clutter', () => {
    render(<AdminViews />);
    expect(screen.getByText(/ORBIS Admin Center/i)).toBeInTheDocument();
  });
});
