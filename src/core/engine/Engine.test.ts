import { describe, it, expect, vi } from "vitest";
import { Engine } from "./Engine";
import { AdapterManager } from "../managers/AdapterManager";

describe("Engine", () => {
  it("should be a singleton", () => {
    const instance1 = Engine.getInstance();
    const instance2 = Engine.getInstance();
    expect(instance1).toBe(instance2);
  });

  it("should initialize successfully", async () => {
    const engine = Engine.getInstance();
    await engine.initialize({ environment: "test", version: "1.0.0" });
    expect(engine.getStatus()).toBe("RUNNING");
  });

  it("should warn when initializing from RUNNING state", async () => {
    const engine = Engine.getInstance();
    const warnSpy = vi.spyOn(console, "warn");
    await engine.initialize({ environment: "test", version: "1.0.0" });
    expect(warnSpy).toHaveBeenCalled();
  });

  it("should stop successfully", async () => {
    const engine = Engine.getInstance();
    await engine.stop();
    expect(engine.getStatus()).toBe("STOPPED");
  });

  it("should handle initialization failure", async () => {
    const engine = Engine.getInstance();
    const adapterManager = AdapterManager.getInstance();
    vi.spyOn(adapterManager, "initializeAll").mockRejectedValueOnce(
      new Error("Test Error"),
    );

    await expect(
      engine.initialize({ environment: "test", version: "1.0.0" }),
    ).rejects.toThrow("Test Error");
    expect(engine.getStatus()).toBe("STOPPED");
  });
});
