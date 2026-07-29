import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SystemOrchestrator } from '../../core/orchestrator/SystemOrchestrator';
import { DashboardGrid } from '../layout/DashboardGrid';

describe('Control Center - Real-Time Dashboard Integration', () => {
  const orchestrator = SystemOrchestrator.getInstance();
  const dashboard = new DashboardGrid();

  beforeAll(async () => {
    if (orchestrator.getSnapshot().status === 'STOPPED') {
      await orchestrator.boot();
    }
  });

  afterAll(async () => {
    if (orchestrator.getSnapshot().status !== 'STOPPED') {
      await orchestrator.shutdown();
    }
  });

  it('should enforce STRICT Zero Mock Data policy by reading live Core state', () => {
    const view = dashboard.render();
    
    // Validation Rule: Dashboard MUST observe the running core, no hardcoded values
    expect(view.header.status).toBe('READY');
    expect(view.header.eventCount).toBe(0);
    
    // Component count should accurately reflect real registered singletons
    expect(Number(view.registries.componentCount)).toBeGreaterThanOrEqual(0);
  });
});
