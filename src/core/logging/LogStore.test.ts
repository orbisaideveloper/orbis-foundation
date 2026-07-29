import { describe, it, expect, beforeEach } from 'vitest';
import { LogStore } from './LogStore';

describe('LogStore', () => {
    let store: LogStore;

    beforeEach(() => {
        store = LogStore.getInstance();
        store.clear();
    });

    it('should be a singleton', () => {
        const instance2 = LogStore.getInstance();
        expect(store).toBe(instance2);
    });

    it('should store and retrieve logs', () => {
        store.addLog('{"level":"INFO","message":"Test 1"}');
        store.addLog('{"level":"ERROR","message":"Test 2"}');
        
        const logs = store.getLogs();
        expect(logs).toHaveLength(2);
        expect(logs[0]).toContain('Test 1');
    });

    it('should not exceed MAX_LOGS limit and follow FIFO', () => {
        // ১০০০ এর বেশি লগ অ্যাড করছি
        for (let i = 0; i < 1005; i++) {
            store.addLog(`Log ${i}`);
        }
        
        const logs = store.getLogs();
        expect(logs).toHaveLength(1000);
        // প্রথম ৫টা লগ (0 থেকে 4) ডিলিট হয়ে যাওয়ার কথা
        expect(logs[0]).toBe('Log 5'); 
        expect(logs[999]).toBe('Log 1004');
    });

    it('should clear all logs', () => {
        store.addLog('Test log');
        store.clear();
        expect(store.getLogs()).toHaveLength(0);
    });
});
