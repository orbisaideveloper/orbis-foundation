import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SystemOrchestrator } from './SystemOrchestrator';
import { EventBus } from '../events/EventBus';
import { HealthReporter } from '../health/HealthReporter';
import { Logger } from '../logging/Logger';

vi.mock('../events/EventBus', () => ({
  EventBus: { getInstance: vi.fn(() => ({ publish: vi.fn(), getTotalEventsPublished: vi.fn(() => 0) })) }
}));
vi.mock('../health/HealthReporter', () => ({
  HealthReporter: { getInstance: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })) }
}));
vi.mock('../logging/Logger', () => ({
  Logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}));

describe('SystemOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should follow correct boot sequence', async () => {
    const orchestrator = SystemOrchestrator.getInstance();
    await orchestrator.boot();
    
    expect(Logger.info).toHaveBeenCalledWith('System is now READY.', expect.any(Object));
    expect(orchestrator.getSnapshot().status).toBe('READY');
  });

  it('should follow correct shutdown sequence', async () => {
    const orchestrator = SystemOrchestrator.getInstance();
    await orchestrator.shutdown();
    
    expect(HealthReporter.getInstance().stop).toHaveBeenCalled();
    expect(Logger.info).toHaveBeenCalledWith('System stopped safely.');
    expect(orchestrator.getSnapshot().status).toBe('STOPPED');
  });
});
