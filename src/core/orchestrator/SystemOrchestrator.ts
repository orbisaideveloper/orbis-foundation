import { EventBus } from '../events/EventBus';
import { Logger } from '../logging/Logger';
import { LogStore } from '../logging/LogStore';
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
    EventBus.getInstance().publish('SYSTEM_STARTING', { timestamp: new Date().toISOString() });
    Logger.info('System initialization started.');

    try {
      await PluginManager.getInstance().initialize();
      await AdapterManager.getInstance().initialize();
      HealthReporter.getInstance().start(5000);

      this.currentStatus = 'READY';
      const snapshot = this.getSnapshot();
      EventBus.getInstance().publish('SYSTEM_READY', snapshot);
      Logger.info('System is now READY.', { snapshot });
    } catch (error) {
      this.currentStatus = 'ERROR';
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Boot sequence failed', { error: errorMessage });
      EventBus.getInstance().publish('SYSTEM_ERROR', { error: errorMessage });
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    if (this.currentStatus === 'STOPPED') {
      return;
    }

    this.currentStatus = 'STOPPING';
    EventBus.getInstance().publish('SYSTEM_STOPPING', this.getSnapshot());
    Logger.info('System shutdown initiated.');

    try {
      HealthReporter.getInstance().stop();
      this.currentStatus = 'STOPPED';
      EventBus.getInstance().publish('SYSTEM_STOPPED', { timestamp: new Date().toISOString() });
      Logger.info('System stopped safely.');
    } catch (error) {
      this.currentStatus = 'ERROR';
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Shutdown sequence failed', { error: errorMessage });
      throw error;
    }
  }

  public getSnapshot(): SystemSnapshot {
    const healthData = HealthRegistry.getInstance().getRegistryStatus();
    const eventCount = EventBus.getInstance().getTotalEventsPublished();
    const logCount = LogStore.getInstance().getTotalLogs();

    return SystemStatusSnapshot.generate(
      this.currentStatus,
      healthData,
      eventCount,
      logCount
    );
  }
}
