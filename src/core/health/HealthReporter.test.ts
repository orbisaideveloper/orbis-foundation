import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HealthReporter } from './HealthReporter';
import { HealthRegistry } from './HealthRegistry';
import { EventBus } from '../events/EventBus';

describe('HealthReporter', () => {
    let reporter: HealthReporter;
    let registry: HealthRegistry;
    let eventBus: EventBus;

    beforeEach(() => {
        reporter = HealthReporter.getInstance();
        registry = HealthRegistry.getInstance();
        eventBus = EventBus.getInstance();
        
        registry.clear(); // Clean up before each test
        reporter.stop(); 
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should be a singleton', () => {
        const instance2 = HealthReporter.getInstance();
        expect(reporter).toBe(instance2);
    });

    it('should start and stop correctly', () => {
        reporter.start(1000);
        expect(reporter.getStatus()).toBe(true);
        reporter.stop();
        expect(reporter.getStatus()).toBe(false);
    });

    it('should run checks and publish success to EventBus', async () => {
        const publishSpy = vi.spyOn(eventBus, 'publish');
        
        registry.register({
            name: 'TestService',
            version: '1.0',
            checkHealth: async () => true
        });

        await reporter.runChecks();

        expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
            type: 'HEALTH_REPORT',
            payload: { allHealthy: true, results: { TestService: true } }
        }));
    });

    it('should report failure if a component throws an error', async () => {
        const publishSpy = vi.spyOn(eventBus, 'publish');
        
        registry.register({
            name: 'FaultyService',
            version: '1.0',
            checkHealth: async () => { throw new Error('Crash'); }
        });

        await reporter.runChecks();

        expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
            type: 'HEALTH_REPORT',
            payload: { allHealthy: false, results: { FaultyService: false } }
        }));
    });
});
