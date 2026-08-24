// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const {
  CAPABILITY_MATRIX,
  FoundationDataCapabilityOrchestrator,
  MAX_FILE_BYTES,
  MAX_PDF_PAGES,
  MAX_TABLE_ROWS,
} = require("../ai/FoundationDataCapabilityOrchestrator.cjs");
const { chatCapabilityRegistry } = require("../ai/ChatCapabilityRegistry.cjs");

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function workbookInput(workbook, fileName = "input.xlsx") {
  const data = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return { fileName, mimeType: XLSX_MIME, dataBase64: data.toString("base64") };
}

function makePdf(pageCount = 1) {
  const objects = [];
  const fontObject = 3 + pageCount * 2;
  const kids = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  for (let index = 0; index < pageCount; index += 1) {
    const pageObject = 3 + index * 2;
    const contentObject = pageObject + 1;
    kids.push(`${pageObject} 0 R`);
    objects[pageObject] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 ${fontObject} 0 R >> >> ` +
      `/Contents ${contentObject} 0 R >>`;
    const stream = `BT /F1 12 Tf 72 720 Td (ORBIS page ${index + 1}) Tj ET`;
    objects[contentObject] =
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }
  objects[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pageCount} >>`;
  objects[fontObject] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = Buffer.byteLength(pdf, "binary");
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\n` +
    `startxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "binary");
}

function pdfInput(pageCount = 1) {
  return {
    fileName: "document.pdf",
    mimeType: "application/pdf",
    dataBase64: makePdf(pageCount).toString("base64"),
  };
}

function prepareAndExecute(
  orchestrator,
  capabilityId,
  input,
  adminId = "admin-a",
) {
  const prepared = orchestrator.prepare({ adminId, capabilityId, input });
  return orchestrator.execute({
    adminId,
    capabilityId,
    input,
    approvalToken: prepared.approvalToken,
  });
}

describe("Task 3C truthful Foundation data capability registry", () => {
  it("registers only the four implemented Admin API capabilities", () => {
    const dataCapabilities = chatCapabilityRegistry
      .list()
      .filter((entry) => entry.kind === "foundation-data-capability");
    expect(dataCapabilities.map((entry) => entry.id)).toEqual([
      "foundation.table.search",
      "foundation.pdf.read",
      "foundation.xlsx.read",
      "foundation.xlsx.create",
    ]);
    expect(dataCapabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "AVAILABLE",
          callable: true,
          requiresApproval: true,
          executionRoute: "admin-capability-api",
        }),
      ]),
    );
    for (const id of [
      "foundation.pdf.create",
      "foundation.pdf-to-xlsx",
      "foundation.xlsx-to-pdf",
      "foundation.image.inspect",
      "foundation.image.edit",
      "foundation.chat.attachments",
    ]) {
      expect(chatCapabilityRegistry.get(id)).toBeNull();
    }
    expect(new Set(CAPABILITY_MATRIX.map((entry) => entry.status))).toEqual(
      new Set(["AVAILABLE", "UNAVAILABLE", "NOT_IMPLEMENTED", "NOT_WIRED"]),
    );
  });
});

describe("Task 3C explicit approval binding", () => {
  it("binds a one-time token to the exact Admin, capability, and input", async () => {
    const orchestrator = new FoundationDataCapabilityOrchestrator({
      signingKey: Buffer.alloc(32, 7),
    });
    const input = {
      fileName: "output.xlsx",
      sheets: [{ name: "Data", rows: [["safe"]] }],
    };
    const prepared = orchestrator.prepare({
      adminId: "admin-a",
      capabilityId: "foundation.xlsx.create",
      input,
    });

    await expect(
      orchestrator.execute({
        adminId: "admin-b",
        capabilityId: "foundation.xlsx.create",
        input,
        approvalToken: prepared.approvalToken,
      }),
    ).rejects.toMatchObject({ code: "APPROVAL_INVALID" });
    const output = await orchestrator.execute({
      adminId: "admin-a",
      capabilityId: "foundation.xlsx.create",
      input,
      approvalToken: prepared.approvalToken,
    });
    expect(output.download).toBe(true);
    await expect(
      orchestrator.execute({
        adminId: "admin-a",
        capabilityId: "foundation.xlsx.create",
        input,
        approvalToken: prepared.approvalToken,
      }),
    ).rejects.toMatchObject({ code: "APPROVAL_REPLAY" });
  });

  it("releases the same approval after a transient table failure", async () => {
    const findMany = vi
      .fn()
      .mockRejectedValueOnce(new Error("database offline"))
      .mockResolvedValueOnce([]);
    const orchestrator = new FoundationDataCapabilityOrchestrator({
      prisma: { foundationAdminMetric: { findMany } },
    });
    const input = { table: "FoundationAdminMetric", query: "online" };
    const prepared = orchestrator.prepare({
      adminId: "admin-a",
      capabilityId: "foundation.table.search",
      input,
    });
    const execution = {
      adminId: "admin-a",
      capabilityId: "foundation.table.search",
      input,
      approvalToken: prepared.approvalToken,
    };

    await expect(orchestrator.execute(execution)).rejects.toMatchObject({
      code: "TABLE_UNAVAILABLE",
    });
    await expect(orchestrator.execute(execution)).resolves.toEqual({
      table: "FoundationAdminMetric",
      rows: [],
    });
  });
});

describe("Task 3C Foundation table search", () => {
  it("uses only an allow-listed Prisma delegate, columns, selection, ordering, and bounded take", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([{ id: "safe", status: "ONLINE" }]);
    const prisma = { foundationAdminMetric: { findMany } };
    const orchestrator = new FoundationDataCapabilityOrchestrator({ prisma });
    const input = {
      table: "FoundationAdminMetric",
      query: "online",
      columns: ["status"],
      limit: MAX_TABLE_ROWS,
    };

    await expect(
      prepareAndExecute(orchestrator, "foundation.table.search", input),
    ).resolves.toEqual({
      table: "FoundationAdminMetric",
      rows: [{ id: "safe", status: "ONLINE" }],
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { OR: [{ status: { contains: "online", mode: "insensitive" } }] },
      select: expect.objectContaining({ id: true, status: true }),
      orderBy: { recordedAt: "desc" },
      take: MAX_TABLE_ROWS,
    });
  });

  it.each([
    "users",
    "orbis_semantic_memory",
    "FoundationUserMemory",
    "FoundationSourceCodeHistory",
  ])("rejects the non-allow-listed table %s before any query", (table) => {
    const findMany = vi.fn();
    const orchestrator = new FoundationDataCapabilityOrchestrator({
      prisma: { foundationUserMemory: { findMany } },
    });
    expect(() =>
      orchestrator.prepare({
        adminId: "admin-a",
        capabilityId: "foundation.table.search",
        input: { table, query: "anything" },
      }),
    ).toThrowError("TABLE_NOT_ALLOWED");
    expect(findMany).not.toHaveBeenCalled();
  });

  it.each([
    [
      "FoundationBrainKnowledge",
      "foundationBrainKnowledge",
      ["category", "content", "tags"],
    ],
    [
      "FoundationLearnedKnowledge",
      "foundationLearnedKnowledge",
      ["category", "content"],
    ],
  ])(
    "preserves the bounded knowledge projection for %s",
    async (table, clientName, columns) => {
      const findMany = vi.fn().mockResolvedValue([]);
      const orchestrator = new FoundationDataCapabilityOrchestrator({
        prisma: { [clientName]: { findMany } },
      });

      await prepareAndExecute(orchestrator, "foundation.table.search", {
        table,
        query: "safe",
      });

      expect(findMany).toHaveBeenCalledWith({
        where: {
          OR: columns.map((column) => ({
            [column]: { contains: "safe", mode: "insensitive" },
          })),
        },
        select: {
          id: true,
          category: true,
          content: true,
          tags: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
      });
    },
  );
});

describe("Task 3C bounded PDF reading", () => {
  it("parses a signed PDF transiently and returns bounded page text", async () => {
    const orchestrator = new FoundationDataCapabilityOrchestrator();
    const output = await prepareAndExecute(
      orchestrator,
      "foundation.pdf.read",
      pdfInput(),
    );
    expect(output).toMatchObject({ fileName: "document.pdf", pageCount: 1 });
    expect(output.text).toContain("ORBIS page 1");
  });

  it("rejects wrong signatures and PDFs beyond the page allow-list", async () => {
    const orchestrator = new FoundationDataCapabilityOrchestrator();
    expect(() =>
      orchestrator.prepare({
        adminId: "admin-a",
        capabilityId: "foundation.pdf.read",
        input: {
          fileName: "renamed.pdf",
          mimeType: "application/pdf",
          dataBase64: Buffer.from("not a pdf").toString("base64"),
        },
      }),
    ).toThrowError("PDF_SIGNATURE_INVALID");
    await expect(
      prepareAndExecute(
        orchestrator,
        "foundation.pdf.read",
        pdfInput(MAX_PDF_PAGES + 1),
      ),
    ).rejects.toMatchObject({ code: "PDF_PAGE_LIMIT_EXCEEDED" });
  });
});

describe("Task 3C bounded XLSX reading and creation", () => {
  it("creates a real workbook and neutralizes formula-like text", async () => {
    const orchestrator = new FoundationDataCapabilityOrchestrator();
    const output = await prepareAndExecute(
      orchestrator,
      "foundation.xlsx.create",
      {
        fileName: "safe-output.xlsx",
        sheets: [{ name: "Data", rows: [["label", "=1+1", "+cmd"]] }],
      },
    );
    expect(output.data.length).toBeLessThanOrEqual(MAX_FILE_BYTES);
    const workbook = XLSX.read(output.data, {
      type: "buffer",
      cellFormula: true,
    });
    expect(workbook.Sheets.Data.B1.v).toBe("'=1+1");
    expect(workbook.Sheets.Data.C1.v).toBe("'+cmd");
    expect(workbook.Sheets.Data.B1.f).toBeUndefined();
  });

  it("reads a bounded workbook but rejects any formula cell", async () => {
    const safeWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      safeWorkbook,
      XLSX.utils.aoa_to_sheet([
        ["name", "value", "text"],
        ["ORBIS", 3, "=untrusted"],
      ]),
      "Data",
    );
    const orchestrator = new FoundationDataCapabilityOrchestrator();
    const output = await prepareAndExecute(
      orchestrator,
      "foundation.xlsx.read",
      workbookInput(safeWorkbook),
    );
    expect(output.sheets[0]).toEqual({
      name: "Data",
      rows: [
        ["name", "value", "text"],
        ["ORBIS", "3", "'=untrusted"],
      ],
    });

    const formulaWorkbook = XLSX.utils.book_new();
    const formulaSheet = XLSX.utils.aoa_to_sheet([[1]]);
    formulaSheet.A1.f = "1+1";
    formulaSheet.A1.v = 2;
    XLSX.utils.book_append_sheet(formulaWorkbook, formulaSheet, "Formula");
    await expect(
      prepareAndExecute(
        orchestrator,
        "foundation.xlsx.read",
        workbookInput(formulaWorkbook, "formula.xlsx"),
      ),
    ).rejects.toMatchObject({ code: "XLSX_FORMULA_REJECTED" });
  });
});
