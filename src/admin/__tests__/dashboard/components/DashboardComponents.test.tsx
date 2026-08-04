import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ComingSoonBadge from '../../../dashboard/components/ComingSoonBadge';
import StatCard from '../../../dashboard/components/StatCard';

describe('Dashboard Extra Components Coverage', () => {
  it('renders ComingSoonBadge component', () => {
    render(<ComingSoonBadge />);
    expect(screen.getByText(/Soon/i)).toBeInTheDocument();
  });

  it('renders StatCard component with props', () => {
    render(<StatCard title="Total Users" value="1,250" />);
    expect(screen.getByText('Total Users')).toBeInTheDocument();
    expect(screen.getByText('1,250')).toBeInTheDocument();
  });
});
