import { describe, it, expect, beforeEach } from 'vitest';
import { Logger } from './Logger';
import { LogStore } from './LogStore';

describe('Logger', () => {
    let logger: Logger;
    let store: LogStore;

    beforeEach(() => {
        logger = Logger.getInstance();
        store = LogStore.getInstance();
        store.clear(); // প্রতি টেস্টের আগে স্টোর ক্লিয়ার করছি
    });

    it('should be a singleton', () => {
        const instance2 = Logger.getInstance();
        expect(logger).toBe(instance2);
    });

    it('should log INFO messages and store them', () => {
        logger.info('AuthModule', 'User logged in', { userId: 101 });
        
        const logs = store.getLogs();
        expect(logs).toHaveLength(1);
        
        const parsedLog = JSON.parse(logs[0]);
        expect(parsedLog.level).toBe('INFO');
        expect(parsedLog.module).toBe('AuthModule');
        expect(parsedLog.message).toBe('User logged in');
        expect(parsedLog.data).toEqual({ userId: 101 });
    });

    it('should log ERROR messages with error objects', () => {
        const mockError = new Error('Database connection failed');
        logger.error('DBModule', 'Crash detected', mockError);
        
        const logs = store.getLogs();
        const parsedLog = JSON.parse(logs[0]);
        
        expect(parsedLog.level).toBe('ERROR');
        expect(parsedLog.module).toBe('DBModule');
        expect(parsedLog.message).toBe('Crash detected');
        expect(parsedLog.error).toBe('Database connection failed');
    });

    it('should log WARN and DEBUG messages', () => {
        logger.warn('System', 'Memory high');
        logger.debug('System', 'Memory at 85%');
        
        const logs = store.getLogs();
        expect(logs).toHaveLength(2);
        expect(JSON.parse(logs[0]).level).toBe('WARN');
        expect(JSON.parse(logs[1]).level).toBe('DEBUG');
    });
});
