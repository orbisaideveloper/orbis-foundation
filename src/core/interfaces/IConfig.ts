// File: src/core/interfaces/IConfig.ts
// Purpose: Strictly typed configuration boundaries.

export interface IConfig {
  readonly environment: "development" | "staging" | "production";
  readonly logLevel: "debug" | "info" | "warn" | "error" | "fatal";
  readonly features: Readonly<Record<string, boolean>>;
}
