import { describe, it, expect, afterEach } from 'vitest';
import { SystemOrchestrator } from './SystemOrchestrator';

describe('SystemOrchestrator', () => {
  const orchestrator = SystemOrchestrator.getInstance();

  afterEach(async () => {
    // Ensure system is stopped after each test to prevent background intervals from hanging
    await orchestrator.shutdown();
  });

  it('should follow correct boot sequence with REAL data and components', async () => {
    await orchestrator.boot();
    const snapshot = orchestrator.getSnapshot();
    
    expect(snapshot.status).toBe('READY');
    // Real EventBus will have processed 'SYSTEM_STARTING' and 'SYSTEM_READY'
    expect(snapshot.metrics.eventCount).toBeGreaterThanOrEqual(2); 
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
});
