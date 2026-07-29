import { describe, it, expect, vi } from 'vitest';
import { EventBus } from './EventBus';

describe('EventBus', () => {
    it('should be a singleton', () => {
        const instance1 = EventBus.getInstance();
        const instance2 = EventBus.getInstance();
        expect(instance1).toBe(instance2);
    });

    it('should publish and subscribe to events', () => {
        const bus = EventBus.getInstance();
        const mockCallback = vi.fn();
        
        bus.subscribe('TEST_EVENT', mockCallback);
        bus.publish({ type: 'TEST_EVENT', payload: 'data', timestamp: Date.now() });
        
        expect(mockCallback).toHaveBeenCalled();
    });
});
