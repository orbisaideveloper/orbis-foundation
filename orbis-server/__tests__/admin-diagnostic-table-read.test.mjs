// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  FOUNDATION_TABLE_PAGE_LIMIT,
  getFoundationTableRow,
  listFoundationTableRows,
} = require("../admin-diagnostic-export.cjs");

describe("Foundation table read-only diagnostics", () => {
  it("rejects non-allowlisted tables before any database read", async () => {
    const prisma = {
      foundationSystemLog: { findMany: vi.fn(), findUnique: vi.fn() },
      $queryRaw: vi.fn(),
    };

    await expect(
      listFoundationTableRows(prisma, "User", { limit: 10 }),
    ).rejects.toMatchObject({ code: "FOUNDATION_TABLE_NOT_ALLOWED" });
    await expect(
      getFoundationTableRow(prisma, "PrismaMigration", "row-1"),
    ).rejects.toMatchObject({ code: "FOUNDATION_TABLE_NOT_ALLOWED" });

    expect(prisma.foundationSystemLog.findMany).not.toHaveBeenCalled();
    expect(prisma.foundationSystemLog.findUnique).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("caps list pagination at 50 and never selects bulk content", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "history-1",
        filePath: "src/a.ts",
        versionHash: "v1",
        updatedAt: new Date("2026-09-05T12:00:00.000Z"),
      },
    ]);
    const prisma = {
      foundationSourceCodeHistory: { findMany },
    };

    const result = await listFoundationTableRows(
      prisma,
      "FoundationSourceCodeHistory",
      { offset: -25, limit: 500 },
    );

    expect(FOUNDATION_TABLE_PAGE_LIMIT).toBe(50);
    expect(result).toMatchObject({
      table: "FoundationSourceCodeHistory",
      offset: 0,
      limit: 50,
      hasMore: false,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 50,
      }),
    );
    const select = findMany.mock.calls[0][0].select;
    expect(select.filePath).toBe(true);
    expect(select.versionHash).toBe(true);
    expect(select.content).toBeUndefined();
  });

  it("returns full content only from one allowed detail lookup", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: "history-1",
      filePath: "src/a.ts",
      versionHash: "v1",
      content: "private source snapshot",
      updatedAt: new Date("2026-09-05T12:00:00.000Z"),
    });
    const prisma = {
      foundationSourceCodeHistory: { findUnique },
    };

    const result = await getFoundationTableRow(
      prisma,
      "FoundationSourceCodeHistory",
      "history-1",
    );

    expect(findUnique).toHaveBeenCalledWith({ where: { id: "history-1" } });
    expect(result.row.content).toBe("private source snapshot");
  });

  it("keeps TimeMachine list metadata-only and detail content single-row", async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "tm-1",
          commitId: "abc",
          filePath: "src/a.ts",
          status: "READY",
          errorMessage: null,
          createdAt: new Date("2026-09-05T12:00:00.000Z"),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "tm-1",
          commitId: "abc",
          filePath: "src/a.ts",
          content: "snapshot content",
          status: "READY",
          errorMessage: null,
          createdAt: new Date("2026-09-05T12:00:00.000Z"),
        },
      ]);
    const prisma = { $queryRaw: queryRaw };

    const list = await listFoundationTableRows(
      prisma,
      "FoundationTimeMachine",
      { offset: 12, limit: 99 },
    );
    expect(list.limit).toBe(50);

    const listSql = Array.from(queryRaw.mock.calls[0][0]).join(" ");
    expect(listSql).toContain('FROM public."FoundationTimeMachine"');
    expect(listSql).not.toMatch(/\bcontent\b/i);
    expect(queryRaw.mock.calls[0][1]).toBe(12);
    expect(queryRaw.mock.calls[0][2]).toBe(50);

    const detail = await getFoundationTableRow(
      prisma,
      "FoundationTimeMachine",
      "tm-1",
    );
    const detailSql = Array.from(queryRaw.mock.calls[1][0]).join(" ");
    expect(detailSql).toMatch(/\bcontent\b/i);
    expect(queryRaw.mock.calls[1][1]).toBe("tm-1");
    expect(detail.row.content).toBe("snapshot content");
  });
});
