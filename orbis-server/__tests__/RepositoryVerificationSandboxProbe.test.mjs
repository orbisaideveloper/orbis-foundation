// @vitest-environment node

import {
  describe,
  expect,
  it,
} from "vitest";

import path from "node:path";

describe("Phase 5B verification worker sandbox", () => {
  it("enforces the restricted worker boundary when invoked by ORBIS verification", () => {
    if (
      process.env.ORBIS_VERIFY_WORKER_SANDBOX !== "1"
    ) {
      return;
    }

    expect(process.permission).toBeDefined();

    expect(
      process.permission.has("child"),
    ).toBe(false);

    expect(
      process.permission.has("worker"),
    ).toBe(false);

    expect(
      process.permission.has("net"),
    ).toBe(false);

    expect(
      process.permission.has(
        "fs.read",
        path.join(process.cwd(), ".env"),
      ),
    ).toBe(false);

    expect(
      process.permission.has(
        "fs.write",
        process.cwd(),
      ),
    ).toBe(false);

    expect(process.env.HF_TOKEN).toBeUndefined();
    expect(
      process.env.SONAR_TOKEN,
    ).toBeUndefined();
    expect(
      process.env.SUPABASE_ACCESS_TOKEN,
    ).toBeUndefined();

    expect(process.env.DATABASE_URL).toContain(
      "127.0.0.1:1/orbis",
    );
  });
});
