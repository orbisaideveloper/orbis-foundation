/**
 * ORBIS Foundation - Base Plugin Interface
 * Ensures all business logic modules are strictly plugin-based.
 */
export interface IPlugin {
  readonly name: string;
  readonly version: string;
  initialize(): Promise<void>;
  execute(payload: any): Promise<any>;
  terminate(): Promise<void>;
}
