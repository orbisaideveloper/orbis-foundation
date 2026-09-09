// @vitest-environment node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ADMIN_DEMO_ORGANIZATION_ID,
  lotteryAccountingDemoClient,
} from "../lotteryAccountingDemoClient";

describe("lotteryAccountingDemoClient", () => {
  it("returns one non-zero isolated demo organization/workspace without sharing mutable references", async () => {
    const organizations = await lotteryAccountingDemoClient.listOrganizations();
    expect(organizations).toEqual([
      expect.objectContaining({
        id: ADMIN_DEMO_ORGANIZATION_ID,
        name: "ORBiS Demo Lottery",
      }),
    ]);

    const first = await lotteryAccountingDemoClient.loadWorkspace(
      ADMIN_DEMO_ORGANIZATION_ID,
    );
    expect(first.organization.id).toBe(ADMIN_DEMO_ORGANIZATION_ID);
    expect(first.sales).toHaveLength(1);
    expect(first.payments).toHaveLength(1);
    expect(first.summary.grossSalesPaise).toBe("80000");
    expect(first.summary.outstandingPaise).toBe("49902");

    first.organization.name = "mutated";
    const second = await lotteryAccountingDemoClient.loadWorkspace(
      ADMIN_DEMO_ORGANIZATION_ID,
    );
    expect(second.organization.name).toBe("ORBiS Demo Lottery");
  });

  it("fails closed for non-demo organization ids", async () => {
    await expect(
      lotteryAccountingDemoClient.loadWorkspace("admin-real-org"),
    ).rejects.toThrow("DEMO ORGANIZATION NOT FOUND");
  });

  it("contains no privileged Admin/Public accounting fetch dependency", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../lotteryAccountingDemoClient.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toContain("authenticatedAdminFetch");
    expect(source).not.toContain("/api/admin/");
    expect(source).not.toContain("/api/accounting/");
  });
});
