import { describe, it, expect } from 'vitest';
import { Engine } from './Engine';

describe('Engine', () => {
    it('should be a singleton', () => {
        const instance1 = Engine.getInstance();
        const instance2 = Engine.getInstance();
        expect(instance1).toBe(instance2);
    });

    it('should have initial status IDLE', () => {
        const engine = Engine.getInstance();
        expect(engine.getStatus()).toBe('IDLE');
    });
});
