// File: src/core/interfaces/IEvent.ts
// Purpose: Advanced generic event structure for system-wide communication.

export interface IEvent<T = Record<string, unknown>> {
    readonly id: string;
    readonly type: string;
    readonly timestamp: number;
    readonly source: string;
    readonly payload: T;
}
