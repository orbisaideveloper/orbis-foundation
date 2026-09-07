// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WORKSPACE = path.resolve(
  "src/admin/dashboard/sections/LotteryAccountingWorkspace.tsx",
);
const TYPES = path.resolve("src/admin/models/lotteryAccountingTypes.ts");

describe("Accounting Party master contact contract", () => {
  it("captures email and phone and sends both through Party create/update", () => {
    const source = fs.readFileSync(WORKSPACE, "utf8");
    const types = fs.readFileSync(TYPES, "utf8");

    expect(source).toContain('aria-label="Party email"');
    expect(source).toContain('autoComplete="email"');
    expect(source).toContain('autoComplete="tel"');
    expect(source).toContain("email: partyEmail.trim() || undefined");
    expect(source).toContain("phone: partyPhone.trim() || undefined");
    expect(types).toContain("email: string | null;");
    expect(types).toContain("phone: string | null;");
  });
});
