import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { RuntimeProvider, useRuntime } from '../../runtime/RuntimeContext';
import { ServiceStatus } from '../../runtime/types';

// Helper component to test Runtime context
const TestRuntimeConsumer = () => {
  const { engineStatus, brainStatus, metrics, updateRuntimeState } = useRuntime();

  const handleSimulateEventBus = () => {
    updateRuntimeState({
      engineStatus: 'HEALTHY' as ServiceStatus,
      brainStatus: 'HEALTHY' as ServiceStatus,
      metrics: { cpuUsage: 45, memoryUsage: 60, activeNodes: 3 }
    });
  };

  return (
    <div>
      <div data-testid="engine-status">{engineStatus}</div>
      <div data-testid="brain-status">{brainStatus}</div>
      <div data-testid="cpu-usage">{metrics.cpuUsage}</div>
      <button onClick={handleSimulateEventBus}>Simulate Core Event</button>
    </div>
  );
};

describe('Runtime Integration (Step-304)', () => {
  it('provides default UNKNOWN status initially', () => {
    render(
      <RuntimeProvider>
        <TestRuntimeConsumer />
      </RuntimeProvider>
    );
    
    expect(screen.getByTestId('engine-status').textContent).toBe('UNKNOWN');
    expect(screen.getByTestId('brain-status').textContent).toBe('UNKNOWN');
    expect(screen.getByTestId('cpu-usage').textContent).toBe('0');
  });

  it('updates state securely when real-time data arrives', () => {
    render(
      <RuntimeProvider>
        <TestRuntimeConsumer />
      </RuntimeProvider>
    );
    
    const updateBtn = screen.getByText('Simulate Core Event');
    
    act(() => {
      updateBtn.click();
    });
    
    expect(screen.getByTestId('engine-status').textContent).toBe('HEALTHY');
    expect(screen.getByTestId('brain-status').textContent).toBe('HEALTHY');
    expect(screen.getByTestId('cpu-usage').textContent).toBe('45');
  });

  it('throws error if useRuntime is used outside of RuntimeProvider', () => {
    // Suppress console.error for expected error boundary test
    const consoleError = console.error;
    console.error = () => {};
    
    const ComponentWithNoProvider = () => {
      useRuntime();
      return <div>Will throw</div>;
    };
    
    expect(() => render(<ComponentWithNoProvider />)).toThrow('useRuntime must be used within a RuntimeProvider');
    
    // Restore console.error
    console.error = consoleError;
  });
});
