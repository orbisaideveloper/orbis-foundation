import { describe, it, expect } from 'vitest';
import { SystemStatusSnapshot } from './SystemStatusSnapshot';

describe('SystemStatusSnapshot', () => {
  it('should generate an immutable snapshot with correct data', () => {
    const healthData = { core: 'healthy' };
    const snapshot = SystemStatusSnapshot.generate('READY', healthData, 10, 5);

    expect(snapshot.status).toBe('READY');
    expect(snapshot.metrics.eventCount).toBe(10);
    expect(snapshot.metrics.logCount).toBe(5);
    expect(snapshot.health).toEqual(healthData);
    
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.metrics)).toBe(true);
    expect(Object.isFrozen(snapshot.health)).toBe(true);
  });
});
