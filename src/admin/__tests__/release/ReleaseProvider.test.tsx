import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { ReleaseProvider, useRelease } from '../../release/ReleaseContext';

const TestComponent = () => {
  const { activeVersion, rollback } = useRelease();
  return (
    <div>
      <div data-testid="version">{activeVersion}</div>
      <button onClick={() => rollback('v0.9.0-rollback')} data-testid="rollback-btn">Rollback</button>
    </div>
  );
};

describe('Release Integration', () => {
  it('provides default active version initially', () => {
    render(
      <ReleaseProvider>
        <TestComponent />
      </ReleaseProvider>
    );
    expect(screen.getByTestId('version')).toHaveTextContent('v1.0.0-phase03');
  });

  it('handles the full release lifecycle correctly via rollback', () => {
    render(
      <ReleaseProvider>
        <TestComponent />
      </ReleaseProvider>
    );
    
    act(() => {
      screen.getByTestId('rollback-btn').click();
    });
    
    expect(screen.getByTestId('version')).toHaveTextContent('v0.9.0-rollback');
  });
});
