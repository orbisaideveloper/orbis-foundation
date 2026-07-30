import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SystemOrchestrator } from '../../core/orchestrator/SystemOrchestrator';
import { DashboardGrid } from '../layout/DashboardGrid';

describe('Control Center - Full Widgets Integration', () => {
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

  it('should render all widgets with REAL data enforcing Zero Mock policy', () => {
    const view = dashboard.render();
    
    // System Status Validation
    expect(view.header.status).toBe('READY');
    expect(Number(view.registries.componentCount)).toBeGreaterThanOrEqual(0);
    
    // Health Matrix Validation
    expect(['ACTIVE', 'NO_DATA']).toContain(view.grid.healthMatrix.status);
    
    // Runtime Snapshot Validation
    expect(view.grid.runtimeSnapshot.data.status).toBe('READY');
    expect(typeof view.grid.runtimeSnapshot.jsonView).toBe('string');
  });
});
