// File: src/core/interfaces/IEngine.ts
// Purpose: Standard lifecycle contract for all core brain engines.

export interface IEngine {
    readonly name: string;
    readonly version: string;
    
    /** Initializes the engine dependencies without starting it */
    initialize(): Promise<void>;
    
    /** Starts the engine's primary event loop or listeners */
    start(): Promise<void>;
    
    /** Safely terminates operations and clears memory */
    stop(): Promise<void>;
    
    /** Returns the current health/status of the engine */
    status(): 'IDLE' | 'RUNNING' | 'STOPPED' | 'ERROR';
}
