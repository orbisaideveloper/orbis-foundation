import { IExecutionRequest } from "./IExecutionRequest";
import { IExecutionResult } from "./IExecutionResult";

export interface IExecutionRuntime {
  getName(): string;
  getVersion(): string;
  getSupportedCapabilities(): string[];
  initialize(): Promise<void>;
  healthCheck(): Promise<boolean>;
  execute(request: IExecutionRequest): Promise<IExecutionResult>;
  shutdown(): Promise<void>;
}
