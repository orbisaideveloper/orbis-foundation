/**
 * ORBIS Foundation - Base Adapter Interface
 * Ensures all external integrations follow a standard adapter pattern.
 */
export interface IAdapter {
  readonly providerName: string;
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<boolean>;
}
