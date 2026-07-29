// File: src/core/events/EventBus.ts
// Purpose: Centralized, decoupled, and generic event routing system.

import { EventEmitter } from 'node:events';
import { IEvent } from '../interfaces/IEvent';

export class EventBus {
    private readonly emitter: EventEmitter;
    private static instance: EventBus;

    // Singleton Pattern to ensure only ONE EventBus exists in the entire system
    private constructor() {
        this.emitter = new EventEmitter();
        // Prevent memory leaks by setting a high max listeners limit safely
        this.emitter.setMaxListeners(50); 
    }

    /** Retrieves the singleton instance of the Event Bus */
    public static getInstance(): EventBus {
        if (!EventBus.instance) {
            EventBus.instance = new EventBus();
        }
        return EventBus.instance;
    }

    /** 
     * Publishes an event to the system.
     * Uses Generics <T> to ensure the payload is strictly typed.
     */
    public publish<T>(event: IEvent<T>): void {
        if (!event.type || !event.id) {
            throw new Error('Invalid Event: Missing required fields (type, id).');
        }
        this.emitter.emit(event.type, event);
    }

    /** 
     * Subscribes to a specific event type.
     * The callback automatically infers the correct payload type.
     */
    public subscribe<T>(eventType: string, callback: (event: IEvent<T>) => void): void {
        this.emitter.on(eventType, callback);
    }

    /** 
     * Removes a subscription to prevent memory leaks when engines shut down.
     */
    public unsubscribe<T>(eventType: string, callback: (event: IEvent<T>) => void): void {
        this.emitter.off(eventType, callback);
    }
}
