import { describe, it, expect } from 'vitest';
import { PluginManager } from './PluginManager';
import { IPlugin } from '../interfaces/IPlugin';

describe('PluginManager', () => {
    it('should be a singleton', () => {
        const instance1 = PluginManager.getInstance();
        const instance2 = PluginManager.getInstance();
        expect(instance1).toBe(instance2);
    });

    it('should register a plugin', () => {
        const manager = PluginManager.getInstance();
        const mockPlugin: IPlugin = {
            name: 'TestPlugin',
            version: '1.0.0',
            initialize: async () => {},
            execute: async () => {}
        };
        manager.register(mockPlugin);
        expect(manager.getPlugin('TestPlugin')).toBe(mockPlugin);
    });
});
