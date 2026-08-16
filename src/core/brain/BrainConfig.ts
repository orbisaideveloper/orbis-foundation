/**
 * TASK-015 (Part 1C) — Minimal Brain Configuration Layer
 *
 * AUDIT FINDING: The historical files
 *   src/brain/brain_config.json
 *   src/brain/BrainController.js
 * do not exist anywhere in this repository. There is no legacy dynamic
 * Brain configuration architecture to restore, and TASK-015 does not
 * recreate one blindly.
 *
 * WHAT THIS FILE IS:
 * A single, centrally-defined, deterministic set of non-secret constants
 * that the existing Brain flow (BrainRequestGateway ->
 * BrainCapabilityOrchestrator -> ControlledCapabilityExecution ->
 * LocalCapabilityDiscovery) already depends on implicitly — specifically
 * the module-name identifiers used for structured logging (Part 1B).
 * Centralizing them here means every Brain file logs under one
 * consistent, typed identifier instead of re-declaring the same string
 * literal in four separate files.
 *
 * WHAT THIS FILE IS NOT:
 * - It is NOT a second configuration system (Logger.ts remains the only
 *   logging infrastructure; ExecutionPolicyEngine remains the only
 *   policy engine).
 * - It contains NO business logic and makes NO decisions.
 * - It cannot change authorization/execution behavior — nothing in the
 *   Brain flow branches on these values, they are purely descriptive
 *   labels attached to log entries.
 * - It contains NO secrets, tokens, or credentials.
 */
export const BRAIN_MODULE_NAMES = {
  requestGateway: "BrainRequestGateway",
  capabilityOrchestrator: "BrainCapabilityOrchestrator",
  controlledExecution: "ControlledCapabilityExecution",
  capabilityDiscovery: "LocalCapabilityDiscovery",
} as const;

export type BrainModuleName =
  (typeof BRAIN_MODULE_NAMES)[keyof typeof BRAIN_MODULE_NAMES];
