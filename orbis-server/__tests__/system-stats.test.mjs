// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { getSystemStats } = require("../system-stats.cjs");

describe("system stats unsupported-environment behavior", () => {
  it("returns sanitized unavailable CPU state without throwing or logging", () => {
    const stats = getSystemStats({
      os: {
        cpus: () => {
          throw new Error("unsupported CPU model");
        },
        totalmem: () => 0,
        freemem: () => 0,
        loadavg: () => [],
        uptime: () => 0,
        arch: () => "arm64",
        platform: () => "android",
        release: () => "unknown",
      },
      process: {
        uptime: () => 0,
        memoryUsage: () => ({ heapUsed: 0 }),
      },
    });

    expect(stats).toMatchObject({
      cpuCores: 0,
      cpuModel: "Unavailable",
      hostname: "Unavailable",
      ramUsedPercent: "0.0",
      status: "ONLINE",
    });
    expect(stats.load).toBe("0.00");
  });
});
