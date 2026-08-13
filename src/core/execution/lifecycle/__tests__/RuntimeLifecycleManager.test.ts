import { describe, it, expect, beforeEach } from "vitest";
import { RuntimeLifecycleManager } from "../RuntimeLifecycleManager";
import { LifecycleState } from "../LifecycleState";

describe("RuntimeLifecycleManager", () => {
  let manager: RuntimeLifecycleManager;
  const TEST_ID = "test-runtime-01";
  const VERSION = "1.0.0";
  const CAPABILITIES = ["read_file", "write_file"];

  beforeEach(() => {
    manager = new RuntimeLifecycleManager();
  });

  it("should register a new runtime successfully", () => {
    manager.register(TEST_ID, VERSION, CAPABILITIES);
    const health = manager.getHealth(TEST_ID);
    expect(health.state).toBe(LifecycleState.REGISTERED);
    expect(health.ready).toBe(false);
  });

  it("should reject duplicate registration", () => {
    manager.register(TEST_ID, VERSION, CAPABILITIES);
    expect(() => manager.register(TEST_ID, VERSION, CAPABILITIES)).toThrowError(
      /already registered/,
    );
  });

  it("should initialize and set ready", () => {
    manager.register(TEST_ID, VERSION, CAPABILITIES);
    manager.initialize(TEST_ID);
    expect(manager.getHealth(TEST_ID).state).toBe(LifecycleState.INITIALIZING);

    manager.setReady(TEST_ID);
    const health = manager.getHealth(TEST_ID);
    expect(health.state).toBe(LifecycleState.READY);
    expect(health.ready).toBe(true);
  });

  it("should reject READY transition if not INITIALIZING", () => {
    manager.register(TEST_ID, VERSION, CAPABILITIES);
    expect(() => manager.setReady(TEST_ID)).toThrowError(
      /Invalid state transition/,
    );
  });

  it("should transition to FAILED state", () => {
    manager.register(TEST_ID, VERSION, CAPABILITIES);
    manager.initialize(TEST_ID);
    manager.setFailed(TEST_ID, "Init timeout");
    const health = manager.getHealth(TEST_ID);
    expect(health.state).toBe(LifecycleState.FAILED);
    expect(health.healthy).toBe(false);
    expect(health.error).toBe("Init timeout");
  });

  it("should stop a running runtime", () => {
    manager.register(TEST_ID, VERSION, CAPABILITIES);
    manager.initialize(TEST_ID);
    manager.setReady(TEST_ID);
    manager.stop(TEST_ID);
    expect(manager.getHealth(TEST_ID).state).toBe(LifecycleState.STOPPED);
  });

  it("should verify declared capabilities safely", () => {
    manager.register(TEST_ID, VERSION, CAPABILITIES);
    manager.initialize(TEST_ID);
    manager.setReady(TEST_ID);

    // Declared and READY
    expect(manager.verifyCapability(TEST_ID, "read_file")).toBe(true);
    // Undeclared
    expect(manager.verifyCapability(TEST_ID, "delete_db")).toBe(false);
  });

  it("should reject capability execution if not READY", () => {
    manager.register(TEST_ID, VERSION, CAPABILITIES);
    // Still in REGISTERED state
    expect(manager.verifyCapability(TEST_ID, "read_file")).toBe(false);
  });

  it("should throw error for unregistered runtime verification", () => {
    expect(() =>
      manager.verifyCapability("unknown-id", "read_file"),
    ).toThrowError(/UNREGISTERED/);
  });
});
