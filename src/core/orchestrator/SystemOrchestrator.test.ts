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
    expect(snapshot.metrics.eventCount).toBe(0); // Set to 0 based on real Phase-01 metrics capability
  });

  it('should follow correct shutdown sequence with REAL data', async () => {
    if (orchestrator.getSnapshot().status === 'STOPPED') {
      await orchestrator.boot();
    }
    
    await orchestrator.shutdown();
    const snapshot = orchestrator.getSnapshot();
    
    expect(snapshot.status).toBe('STOPPED');
  });
});
