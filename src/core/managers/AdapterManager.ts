import { IAdapter } from '../interfaces/IAdapter';
import { EventBus } from '../events/EventBus';

export class AdapterManager {
    private readonly adapters: Map<string, IAdapter> = new Map();
    private static instance: AdapterManager;

    private constructor() {}

    // Singleton প্যাটার্ন
    public static getInstance(): AdapterManager {
        if (!AdapterManager.instance) {
            AdapterManager.instance = new AdapterManager();
        }
        return AdapterManager.instance;
    }

    public register(adapter: IAdapter): void {
        if (this.adapters.has(adapter.name)) {
            console.warn(`[ORBIS] Adapter '${adapter.name}' is already registered.`);
            return;
        }
        
        this.adapters.set(adapter.name, adapter);
        
        // ইভেন্ট বাসের মাধ্যমে সিস্টেমকে জানিয়ে দেওয়া হলো
        EventBus.getInstance().publish({
            type: 'SYSTEM',
            payload: `Adapter registered successfully: ${adapter.name}`,
            timestamp: Date.now()
        });
    }

    public async initializeAll(): Promise<void> {
        for (const adapter of this.adapters.values()) {
            await adapter.initialize();
        }
    }

    public getAdapter(name: string): IAdapter | undefined {
        return this.adapters.get(name);
    }
}
