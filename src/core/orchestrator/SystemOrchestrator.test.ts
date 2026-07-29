import { describe, it, expect, afterEach } from 'vitest';
import { SystemOrchestrator } from './SystemOrchestrator';

describe('SystemOrchestrator', () => {
  const orchestrator = SystemOrchestrator.getInstance();

  afterEach(async () => {
    // Ensure system is stopped after each test to prevent background intervals from hanging
    if (orchestrator.getSnapshot().status !== 'STOPPED') {
      await orchestrator.shutdown();
    }
  });

  it('should follow correct boot sequence with REAL data and components', async () => {
    if (orchestrator.getSnapshot().status !== 'STOPPED') {
      await orchestrator.shutdown();
    }
    await orchestrator.boot();
    const snapshot = orchestrator.getSnapshot();
    
    expect(snapshot.status).toBe('READY');
    expect(snapshot.metrics.eventCount).toBe(0); 
  });

  it('should ignore boot command and log warning if system is already running', async () => {
    // Ensure running
    if (orchestrator.getSnapshot().status === 'STOPPED') {
      await orchestrator.boot();
    }
    // Try booting again - this should hit the early return branch
    await orchestrator.boot();
    
    expect(orchestrator.getSnapshot().status).toBe('READY');
  });

  it('should follow correct shutdown sequence with REAL data', async () => {
    // Ensure the system is running first
    if (orchestrator.getSnapshot().status === 'STOPPED') {
      await orchestrator.boot();
    }
    
    await orchestrator.shutdown();
    const snapshot = orchestrator.getSnapshot();
    
    expect(snapshot.status).toBe('STOPPED');
  });

  it('should ignore shutdown command if system is already stopped', async () => {
    // Ensure stopped
    if (orchestrator.getSnapshot().status !== 'STOPPED') {
      await orchestrator.shutdown();
    }
    // Try shutting down again - this should hit the early return branch
    await orchestrator.shutdown();
    
    expect(orchestrator.getSnapshot().status).toBe('STOPPED');
  });
});
