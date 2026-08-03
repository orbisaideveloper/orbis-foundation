// @ts-nocheck
import { IEngine } from '../interfaces/IEngine';
import { IConfig } from '../interfaces/IConfig';
import { EventBus } from '../events/EventBus';
import { PluginManager } from '../managers/PluginManager';
import { AdapterManager } from '../managers/AdapterManager';

export class Engine implements IEngine {
    private static instance: Engine;
    private status: 'IDLE' | 'INITIALIZING' | 'RUNNING' | 'STOPPED' = 'IDLE';
    private config: IConfig | null = null;
    
    private readonly pluginManager: PluginManager;
    private readonly adapterManager: AdapterManager;
    private readonly eventBus: EventBus;

    private constructor() {
        this.pluginManager = PluginManager.getInstance();
        this.adapterManager = AdapterManager.getInstance();
        this.eventBus = EventBus.getInstance();
    }

    public static getInstance(): Engine {
        if (!Engine.instance) {
            Engine.instance = new Engine();
        }
        return Engine.instance;
    }

    public async initialize(config: IConfig): Promise<void> {
        if (this.status !== 'IDLE' && this.status !== 'STOPPED') {
            console.warn(`[ORBIS Engine] Cannot initialize from status: ${this.status}`);
            return;
        }

        this.status = 'INITIALIZING';
        this.config = config;

        this.eventBus.publish({
            type: 'SYSTEM',
            payload: 'Engine initialization started',
            timestamp: Date.now()
        });

        try {
            await this.adapterManager.initializeAll();
            await this.pluginManager.initializeAll();
            
            this.status = 'RUNNING';
            
            this.eventBus.publish({
                type: 'SYSTEM',
                payload: 'Engine running successfully',
                timestamp: Date.now()
            });
        } catch (error) {
            this.status = 'STOPPED';
            console.error('[ORBIS Engine] Initialization failed:', error);
            throw error;
        }
    }

    public getStatus(): string {
        return this.status;
    }
    
    public async stop(): Promise<void> {
        this.status = 'STOPPED';
        this.eventBus.publish({
            type: 'SYSTEM',
            payload: 'Engine stopped safely',
            timestamp: Date.now()
        });
    }
}
