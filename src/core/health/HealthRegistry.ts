import { IHealthComponent } from '../interfaces/IHealthComponent';

export class HealthRegistry {
    private static instance: HealthRegistry;
    private readonly components: Map<string, IHealthComponent> = new Map();

    private constructor() {}

    public static getInstance(): HealthRegistry {
        if (!HealthRegistry.instance) {
            HealthRegistry.instance = new HealthRegistry();
        }
        return HealthRegistry.instance;
    }

    public register(component: IHealthComponent): void {
        if (this.components.has(component.name)) {
            throw new Error(`[ORBIS Health] Component ${component.name} is already registered.`);
        }
        this.components.set(component.name, component);
    }

    public getComponent(name: string): IHealthComponent | undefined {
        return this.components.get(name);
    }

    public getAllComponents(): IHealthComponent[] {
        return Array.from(this.components.values());
    }
    
    public clear(): void {
        this.components.clear();
    }
}
