import { describe, it, expect, beforeEach } from "vitest";
import { HealthRegistry } from "./HealthRegistry";
import { IHealthComponent } from "../interfaces/IHealthComponent";

describe("HealthRegistry", () => {
  let registry: HealthRegistry;

  beforeEach(() => {
    registry = HealthRegistry.getInstance();
    registry.clear(); // রিসেট করে নিচ্ছি প্রতি টেস্টের আগে
  });

  it("should be a singleton", () => {
    const instance2 = HealthRegistry.getInstance();
    expect(registry).toBe(instance2);
  });

  it("should register and retrieve a health component", () => {
    const mockComponent: IHealthComponent = {
      name: "TestDB",
      version: "1.0.0",
      checkHealth: async () => true,
    };

    registry.register(mockComponent);
    expect(registry.getComponent("TestDB")).toBe(mockComponent);
    expect(registry.getAllComponents()).toHaveLength(1);
  });

  it("should throw error when registering duplicate component", () => {
    const mockComponent: IHealthComponent = {
      name: "TestAPI",
      version: "1.0.0",
      checkHealth: async () => true,
    };

    registry.register(mockComponent);
    expect(() => registry.register(mockComponent)).toThrowError(
      /already registered/,
    );
  });
});
