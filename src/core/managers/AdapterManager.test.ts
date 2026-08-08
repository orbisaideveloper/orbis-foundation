import { describe, it, expect } from "vitest";
import { AdapterManager } from "./AdapterManager";
import { IAdapter } from "../interfaces/IAdapter";

describe("AdapterManager", () => {
  it("should be a singleton", () => {
    const instance1 = AdapterManager.getInstance();
    const instance2 = AdapterManager.getInstance();
    expect(instance1).toBe(instance2);
  });

  it("should register an adapter", () => {
    const manager = AdapterManager.getInstance();
    const mockAdapter: IAdapter = {
      name: "TestAdapter",
      version: "1.0.0",
      initialize: async () => {},
      shutdown: async () => {},
    };
    manager.register(mockAdapter);
    expect(manager.getAdapter("TestAdapter")).toBe(mockAdapter);
  });
});
