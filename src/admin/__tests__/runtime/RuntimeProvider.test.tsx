import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { RuntimeProvider, useRuntime } from '../../runtime/RuntimeContext';

const TestComponent = () => {
  const { systemHealth, metrics, triggerRestart } = useRuntime();
  return (
    <div>
      <div data-testid="health">{systemHealth}</div>
      <div data-testid="cpu">{metrics.cpu}</div>
      <button onClick={triggerRestart} data-testid="restart-btn">Restart</button>
    </div>
  );
};

describe('Runtime Integration (Step-304)', () => {
  it('provides default STABLE status initially', () => {
    render(
      <RuntimeProvider>
        <TestComponent />
      </RuntimeProvider>
    );
    expect(screen.getByTestId('health')).toHaveTextContent('STABLE');
    expect(screen.getByTestId('cpu')).toHaveTextContent('12');
  });

  it('updates state securely when real-time data arrives/actions trigger', () => {
    vi.useFakeTimers();
    render(
      <RuntimeProvider>
        <TestComponent />
      </RuntimeProvider>
    );
    
    act(() => {
      screen.getByTestId('restart-btn').click();
    });
    
    expect(screen.getByTestId('health')).toHaveTextContent('DEGRADED');
    
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    
    expect(screen.getByTestId('health')).toHaveTextContent('STABLE');
    vi.useRealTimers();
  });
});
