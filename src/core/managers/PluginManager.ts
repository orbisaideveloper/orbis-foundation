// @ts-nocheck
import { IPlugin } from "../interfaces/IPlugin";
import { EventBus } from "../events/EventBus";

export class PluginManager {
  private readonly plugins: Map<string, IPlugin> = new Map();
  private static instance: PluginManager;

  private constructor() {}

  // Singleton প্যাটার্ন
  public static getInstance(): PluginManager {
    if (!PluginManager.instance) {
      PluginManager.instance = new PluginManager();
    }
    return PluginManager.instance;
  }

  public register(plugin: IPlugin): void {
    if (this.plugins.has(plugin.name)) {
      console.warn(`[ORBIS] Plugin '${plugin.name}' is already registered.`);
      return;
    }

    this.plugins.set(plugin.name, plugin);

    // ইভেন্ট বাসের মাধ্যমে সিস্টেমকে জানিয়ে দেওয়া হলো
    EventBus.getInstance().publish({
      type: "SYSTEM",
      payload: `Plugin registered successfully: ${plugin.name}`,
      timestamp: Date.now(),
    });
  }

  public async initializeAll(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      await plugin.initialize();
    }
  }

  public getPlugin(name: string): IPlugin | undefined {
    return this.plugins.get(name);
  }
}
