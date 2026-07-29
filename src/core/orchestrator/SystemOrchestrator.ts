import { EventBus } from '../events/EventBus';
import { Logger } from '../logging/Logger';
import { HealthRegistry } from '../health/HealthRegistry';
import { HealthReporter } from '../health/HealthReporter';
import { PluginManager } from '../managers/PluginManager';
import { AdapterManager } from '../managers/AdapterManager';
import { SystemStatusSnapshot, SystemSnapshot } from './SystemStatusSnapshot';

export class SystemOrchestrator {
  private static instance: SystemOrchestrator;
  private currentStatus: SystemSnapshot['status'] = 'STOPPED';

  private constructor() {}

  public static getInstance(): SystemOrchestrator {
    if (!SystemOrchestrator.instance) {
      SystemOrchestrator.instance = new SystemOrchestrator();
    }
    return SystemOrchestrator.instance;
  }

  public async boot(): Promise<void> {
    if (this.currentStatus !== 'STOPPED' && this.currentStatus !== 'ERROR') {
      Logger.warn('System boot ignored: System is already running or starting.');
      return;
    }

    this.currentStatus = 'STARTING';
    // ✅ FIX: Sending object with required 'type' field
    EventBus.getInstance().publish({ type: 'SYSTEM_STARTING', payload: { timestamp: new Date().toISOString() } } as any);
    Logger.info('System initialization started.');

    try {
      await PluginManager.getInstance().initialize();
      await AdapterManager.getInstance().initialize();
      HealthReporter.getInstance().start(5000);

      this.currentStatus = 'READY';
      const snapshot = this.getSnapshot();
      EventBus.getInstance().publish({ type: 'SYSTEM_READY', payload: snapshot } as any);
      Logger.info('System is now READY.', { snapshot });
    } catch (error) {
      this.currentStatus = 'ERROR';
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Boot sequence failed', { error: errorMessage });
      EventBus.getInstance().publish({ type: 'SYSTEM_ERROR', payload: { error: errorMessage } } as any);
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    if (this.currentStatus === 'STOPPED') {
      return;
    }

    this.currentStatus = 'STOPPING';
    EventBus.getInstance().publish({ type: 'SYSTEM_STOPPING', payload: this.getSnapshot() } as any);
    Logger.info('System shutdown initiated.');

    try {
      HealthReporter.getInstance().stop();
      this.currentStatus = 'STOPPED';
      EventBus.getInstance().publish({ type: 'SYSTEM_STOPPED', payload: { timestamp: new Date().toISOString() } } as any);
      Logger.info('System stopped safely.');
    } catch (error) {
      this.currentStatus = 'ERROR';
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Shutdown sequence failed', { error: errorMessage });
      throw error;
    }
  }

  public getSnapshot(): SystemSnapshot {
    // ✅ FIX: Using getAllComponents() instead of non-existent getRegistryStatus()
    const components = HealthRegistry.getInstance().getAllComponents();
    const healthData: Record<string, string> = {};
    
    components.forEach(component => {
      healthData[component.name] = 'REGISTERED';
    });

    // EventBus & LogStore do not track total counts in Phase-01 foundation.
    // Defaulting to 0 to satisfy interface without modifying Phase-01.
    const eventCount = 0;
    const logCount = 0;

    return SystemStatusSnapshot.generate(
      this.currentStatus,
      healthData,
      eventCount,
      logCount
    );
  }
}
