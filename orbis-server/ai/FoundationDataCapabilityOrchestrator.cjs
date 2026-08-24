const crypto = require("node:crypto");
const path = require("node:path");
const { Worker } = require("node:worker_threads");
const { chatCapabilityRegistry } = require("./ChatCapabilityRegistry.cjs");

const APPROVAL_TTL_MS = 3 * 60 * 1000;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_PDF_PAGES = 20;
const MAX_PDF_TEXT_CHARS = 100_000;
const MAX_XLSX_UNCOMPRESSED_BYTES = 4 * 1024 * 1024;
const MAX_XLSX_ENTRIES = 200;
const MAX_SHEETS = 5;
const MAX_ROWS_PER_SHEET = 500;
const MAX_COLUMNS = 50;
const MAX_TOTAL_CELLS = 10_000;
const MAX_CELL_CHARS = 10_000;
const MAX_WORKBOOK_TEXT_CHARS = 250_000;
const MAX_TABLE_ROWS = 50;
const MAX_TABLE_OUTPUT_BYTES = 64 * 1024;
const EXECUTION_TIMEOUT_MS = 5_000;

const KNOWLEDGE_SELECT = Object.freeze({
  id: true,
  category: true,
  content: true,
  tags: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
});
const KNOWLEDGE_ORDER = Object.freeze({ updatedAt: "desc" });

const CAPABILITY_MATRIX = Object.freeze([
  Object.freeze({
    id: "foundation.table.search",
    status: "AVAILABLE",
    reason:
      "Allow-listed Foundation Prisma delegates with bounded parameterized filters.",
  }),
  Object.freeze({
    id: "foundation.pdf.read",
    status: "AVAILABLE",
    reason:
      "Pinned pdf-parse adapter with signature, size, page, text, worker-memory, and timeout bounds.",
  }),
  Object.freeze({
    id: "foundation.pdf.create",
    status: "UNAVAILABLE",
    reason: "No pinned PDF-writing implementation exists.",
  }),
  Object.freeze({
    id: "foundation.xlsx.read",
    status: "AVAILABLE",
    reason:
      "Pinned SheetJS adapter with ZIP, sheet, row, cell, formula, size, worker-memory, and timeout bounds.",
  }),
  Object.freeze({
    id: "foundation.xlsx.create",
    status: "AVAILABLE",
    reason:
      "Pinned SheetJS adapter creates bounded workbooks and neutralizes formula-like text.",
  }),
  Object.freeze({
    id: "foundation.pdf-to-xlsx",
    status: "NOT_IMPLEMENTED",
    reason:
      "No deterministic structured table-conversion implementation exists.",
  }),
  Object.freeze({
    id: "foundation.xlsx-to-pdf",
    status: "NOT_IMPLEMENTED",
    reason: "No PDF-writing or deterministic pagination implementation exists.",
  }),
  Object.freeze({
    id: "foundation.image.inspect",
    status: "UNAVAILABLE",
    reason:
      "No safe local image-inspection implementation or approved provider transport exists.",
  }),
  Object.freeze({
    id: "foundation.image.edit",
    status: "UNAVAILABLE",
    reason:
      "No safe local image-editing implementation or approved provider transport exists.",
  }),
  Object.freeze({
    id: "foundation.chat.attachments",
    status: "NOT_WIRED",
    reason:
      "Chat UI and API attachment transport remains intentionally disabled.",
  }),
]);

const TABLE_SPECS = Object.freeze({
  FoundationAdminMetric: Object.freeze({
    client: "foundationAdminMetric",
    searchable: Object.freeze(["status"]),
    select: Object.freeze({
      id: true,
      ramUsageMb: true,
      cpuLoad: true,
      status: true,
      recordedAt: true,
    }),
    orderBy: Object.freeze({ recordedAt: "desc" }),
  }),
  FoundationSystemLog: Object.freeze({
    client: "foundationSystemLog",
    searchable: Object.freeze([
      "level",
      "source",
      "message",
      "category",
      "severity",
    ]),
    select: Object.freeze({
      id: true,
      level: true,
      source: true,
      message: true,
      timestamp: true,
      category: true,
      severity: true,
      count: true,
      firstSeen: true,
      lastSeen: true,
    }),
    orderBy: Object.freeze({ lastSeen: "desc" }),
  }),
  FoundationBrainKnowledge: Object.freeze({
    client: "foundationBrainKnowledge",
    searchable: Object.freeze(["category", "content", "tags"]),
    select: KNOWLEDGE_SELECT,
    orderBy: KNOWLEDGE_ORDER,
  }),
  FoundationLearnedKnowledge: Object.freeze({
    client: "foundationLearnedKnowledge",
    searchable: Object.freeze(["category", "content"]),
    select: KNOWLEDGE_SELECT,
    orderBy: KNOWLEDGE_ORDER,
  }),
});

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function loadPdfParser() {
  return require("pdf-parse").PDFParse;
}

function loadXlsx() {
  return require("xlsx");
}

function assertPlainObject(value, code = "CAPABILITY_INPUT_INVALID") {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw fail(code);
  }
}

function assertOnlyKeys(value, allowed) {
  assertPlainObject(value);
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw fail("CAPABILITY_INPUT_INVALID");
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function inputHash(capabilityId, input) {
  return crypto
    .createHash("sha256")
    .update(`${capabilityId}\0${canonicalJson(input)}`)
    .digest("hex");
}

function sanitizeFileName(value, extension) {
  if (
    typeof value !== "string" ||
    value.length < extension.length + 1 ||
    value.length > 120 ||
    !/^[A-Za-z0-9][A-Za-z0-9._ -]*$/.test(value) ||
    path.extname(value).toLowerCase() !== extension
  ) {
    throw fail("FILE_NAME_INVALID");
  }
  return value;
}

function decodeFileInput(input, options) {
  assertOnlyKeys(input, ["fileName", "mimeType", "dataBase64"]);
  const fileName = sanitizeFileName(input.fileName, options.extension);
  if (!options.mimeTypes.includes(input.mimeType)) {
    throw fail("FILE_TYPE_INVALID");
  }
  const encoded = input.dataBase64;
  if (
    typeof encoded !== "string" ||
    encoded.length === 0 ||
    encoded.length > Math.ceil((MAX_FILE_BYTES * 4) / 3) + 4 ||
    encoded.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      encoded,
    )
  ) {
    throw fail("FILE_CONTENT_INVALID");
  }
  const data = Buffer.from(encoded, "base64");
  if (data.length === 0 || data.length > MAX_FILE_BYTES) {
    throw fail("FILE_SIZE_INVALID");
  }
  return { fileName, data };
}

function validatePdfInput(input) {
  const decoded = decodeFileInput(input, {
    extension: ".pdf",
    mimeTypes: ["application/pdf"],
  });
  if (
    decoded.data.length < 8 ||
    !decoded.data.subarray(0, 5).equals(Buffer.from("%PDF-", "ascii"))
  ) {
    throw fail("PDF_SIGNATURE_INVALID");
  }
  return decoded;
}

function validateXlsxContainer(data) {
  if (data.length < 22 || data.readUInt32LE(0) !== 0x04034b50) {
    throw fail("XLSX_SIGNATURE_INVALID");
  }
  const searchStart = Math.max(0, data.length - 65_557);
  let endOffset = -1;
  for (let index = data.length - 22; index >= searchStart; index -= 1) {
    if (data.readUInt32LE(index) === 0x06054b50) {
      endOffset = index;
      break;
    }
  }
  if (endOffset < 0) throw fail("XLSX_CONTAINER_INVALID");
  const entryCount = data.readUInt16LE(endOffset + 10);
  const centralSize = data.readUInt32LE(endOffset + 12);
  const centralOffset = data.readUInt32LE(endOffset + 16);
  if (
    entryCount < 1 ||
    entryCount > MAX_XLSX_ENTRIES ||
    centralOffset + centralSize > endOffset
  ) {
    throw fail("XLSX_CONTAINER_INVALID");
  }
  let cursor = centralOffset;
  let totalUncompressed = 0;
  let hasWorkbook = false;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > endOffset || data.readUInt32LE(cursor) !== 0x02014b50) {
      throw fail("XLSX_CONTAINER_INVALID");
    }
    const method = data.readUInt16LE(cursor + 10);
    const uncompressed = data.readUInt32LE(cursor + 24);
    const nameLength = data.readUInt16LE(cursor + 28);
    const extraLength = data.readUInt16LE(cursor + 30);
    const commentLength = data.readUInt16LE(cursor + 32);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > endOffset || ![0, 8].includes(method)) {
      throw fail("XLSX_CONTAINER_INVALID");
    }
    const name = data
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString("utf8");
    if (
      !name ||
      name.includes("\\") ||
      name.split("/").includes("..") ||
      /(?:vbaProject\.bin|externalLinks|embeddings|oleObjects)/i.test(name)
    ) {
      throw fail("XLSX_UNSAFE_CONTENT");
    }
    if (name === "xl/workbook.xml") hasWorkbook = true;
    totalUncompressed += uncompressed;
    if (totalUncompressed > MAX_XLSX_UNCOMPRESSED_BYTES) {
      throw fail("XLSX_EXPANDED_SIZE_INVALID");
    }
    cursor = next;
  }
  if (!hasWorkbook || cursor !== centralOffset + centralSize) {
    throw fail("XLSX_CONTAINER_INVALID");
  }
}

function validateXlsxInput(input) {
  const decoded = decodeFileInput(input, {
    extension: ".xlsx",
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
  });
  validateXlsxContainer(decoded.data);
  return decoded;
}

function withTimeout(operation, timeoutMs = EXECUTION_TIMEOUT_MS) {
  let timer;
  return Promise.race([
    Promise.resolve().then(operation),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(fail("CAPABILITY_TIMEOUT")), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function readPdf(input) {
  const { fileName, data } = validatePdfInput(input);
  const PDFParse = loadPdfParser();
  const parser = new PDFParse({ data });
  try {
    const result = await withTimeout(() =>
      parser.getText({ first: MAX_PDF_PAGES + 1, parseHyperlinks: false }),
    );
    if (result.total > MAX_PDF_PAGES) throw fail("PDF_PAGE_LIMIT_EXCEEDED");
    if (result.text.length > MAX_PDF_TEXT_CHARS) {
      throw fail("PDF_TEXT_LIMIT_EXCEEDED");
    }
    return {
      fileName,
      pageCount: result.total,
      pages: result.pages.map((page) => ({
        number: page.num,
        text: page.text,
      })),
      text: result.text,
    };
  } catch (error) {
    if (error?.code) throw error;
    throw fail("PDF_PARSE_FAILED");
  } finally {
    await parser.destroy().catch(() => {});
  }
}

function usedRangeDimensions(sheet) {
  if (!sheet?.["!ref"]) return { rows: 0, columns: 0 };
  const XLSX = loadXlsx();
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  return { rows: range.e.r + 1, columns: range.e.c + 1 };
}

function assertWorkbookBounds(workbook) {
  if (
    !Array.isArray(workbook.SheetNames) ||
    workbook.SheetNames.length < 1 ||
    workbook.SheetNames.length > MAX_SHEETS ||
    new Set(workbook.SheetNames).size !== workbook.SheetNames.length
  ) {
    throw fail("XLSX_SHEET_LIMIT_EXCEEDED");
  }
  let totalCells = 0;
  for (const sheetName of workbook.SheetNames) {
    if (typeof sheetName !== "string" || sheetName.length > 31) {
      throw fail("XLSX_SHEET_NAME_INVALID");
    }
    const sheet = workbook.Sheets[sheetName];
    const dimensions = usedRangeDimensions(sheet);
    if (
      dimensions.rows > MAX_ROWS_PER_SHEET ||
      dimensions.columns > MAX_COLUMNS
    ) {
      throw fail("XLSX_DIMENSION_LIMIT_EXCEEDED");
    }
    totalCells += dimensions.rows * dimensions.columns;
    if (totalCells > MAX_TOTAL_CELLS) throw fail("XLSX_CELL_LIMIT_EXCEEDED");
    for (const address of Object.keys(sheet || {})) {
      if (address.startsWith("!")) continue;
      const cell = sheet[address];
      if (cell?.f !== undefined) throw fail("XLSX_FORMULA_REJECTED");
      if (typeof cell?.v === "string" && cell.v.length > MAX_CELL_CHARS) {
        throw fail("XLSX_CELL_LIMIT_EXCEEDED");
      }
    }
  }
}

async function readXlsx(input) {
  const { fileName, data } = validateXlsxInput(input);
  const XLSX = loadXlsx();
  try {
    return await withTimeout(() => {
      const workbook = XLSX.read(data, {
        type: "buffer",
        cellFormula: true,
        cellHTML: false,
        cellStyles: false,
        cellNF: false,
        bookVBA: false,
      });
      assertWorkbookBounds(workbook);
      return {
        fileName,
        sheets: workbook.SheetNames.map((name) => ({
          name,
          rows: XLSX.utils
            .sheet_to_json(workbook.Sheets[name], {
              header: 1,
              raw: false,
              defval: null,
              blankrows: false,
            })
            .map((row) => row.map(safeSpreadsheetCell)),
        })),
      };
    });
  } catch (error) {
    if (error?.code) throw error;
    throw fail("XLSX_PARSE_FAILED");
  }
}

function safeSpreadsheetCell(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw fail("XLSX_CELL_INVALID");
    return value;
  }
  if (typeof value === "boolean") return value;
  if (typeof value !== "string" || value.length > MAX_CELL_CHARS) {
    throw fail("XLSX_CELL_INVALID");
  }
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function validateCreateXlsxInput(input) {
  assertOnlyKeys(input, ["fileName", "sheets"]);
  const fileName = sanitizeFileName(input.fileName, ".xlsx");
  if (
    !Array.isArray(input.sheets) ||
    input.sheets.length < 1 ||
    input.sheets.length > MAX_SHEETS
  ) {
    throw fail("XLSX_SHEET_LIMIT_EXCEEDED");
  }
  const names = new Set();
  let totalCells = 0;
  let totalTextChars = 0;
  const sheets = input.sheets.map((sheet) => {
    assertOnlyKeys(sheet, ["name", "rows"]);
    if (
      typeof sheet.name !== "string" ||
      sheet.name.length < 1 ||
      sheet.name.length > 31 ||
      /[\\/?*:[\]]/.test(sheet.name) ||
      names.has(sheet.name) ||
      !Array.isArray(sheet.rows) ||
      sheet.rows.length > MAX_ROWS_PER_SHEET
    ) {
      throw fail("XLSX_SHEET_INVALID");
    }
    names.add(sheet.name);
    const rows = sheet.rows.map((row) => {
      if (!Array.isArray(row) || row.length > MAX_COLUMNS) {
        throw fail("XLSX_DIMENSION_LIMIT_EXCEEDED");
      }
      totalCells += row.length;
      if (totalCells > MAX_TOTAL_CELLS) throw fail("XLSX_CELL_LIMIT_EXCEEDED");
      return row.map((value) => {
        const safeValue = safeSpreadsheetCell(value);
        if (typeof safeValue === "string") totalTextChars += safeValue.length;
        if (totalTextChars > MAX_WORKBOOK_TEXT_CHARS) {
          throw fail("XLSX_CELL_LIMIT_EXCEEDED");
        }
        return safeValue;
      });
    });
    return { name: sheet.name, rows };
  });
  return { fileName, sheets };
}

async function createXlsx(input) {
  const validated = validateCreateXlsxInput(input);
  const XLSX = loadXlsx();
  try {
    const data = await withTimeout(() => {
      const workbook = XLSX.utils.book_new();
      for (const sheet of validated.sheets) {
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.aoa_to_sheet(sheet.rows),
          sheet.name,
        );
      }
      return XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
        compression: true,
      });
    });
    if (!Buffer.isBuffer(data) || data.length > MAX_FILE_BYTES) {
      throw fail("XLSX_OUTPUT_SIZE_INVALID");
    }
    return {
      download: true,
      fileName: validated.fileName,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data,
    };
  } catch (error) {
    if (error?.code) throw error;
    throw fail("XLSX_CREATE_FAILED");
  }
}

function validateTableInput(input) {
  assertOnlyKeys(input, ["table", "query", "columns", "limit"]);
  const spec = TABLE_SPECS[input.table];
  if (!spec) throw fail("TABLE_NOT_ALLOWED");
  if (
    typeof input.query !== "string" ||
    input.query.trim().length < 1 ||
    input.query.length > 200 ||
    /[\u0000-\u001f]/.test(input.query)
  ) {
    throw fail("TABLE_QUERY_INVALID");
  }
  const columns =
    input.columns === undefined ? [...spec.searchable] : input.columns;
  if (
    !Array.isArray(columns) ||
    columns.length < 1 ||
    columns.length > spec.searchable.length ||
    new Set(columns).size !== columns.length ||
    columns.some((column) => !spec.searchable.includes(column))
  ) {
    throw fail("TABLE_COLUMNS_INVALID");
  }
  const limit = input.limit === undefined ? 20 : input.limit;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_TABLE_ROWS) {
    throw fail("TABLE_LIMIT_INVALID");
  }
  return {
    table: input.table,
    query: input.query.trim(),
    columns,
    limit,
    spec,
  };
}

async function searchTable(input, dependencies) {
  const validated = validateTableInput(input);
  const delegate = dependencies.prisma?.[validated.spec.client];
  if (typeof delegate?.findMany !== "function") throw fail("TABLE_UNAVAILABLE");
  let rows;
  try {
    rows = await withTimeout(() =>
      delegate.findMany({
        where: {
          OR: validated.columns.map((column) => ({
            [column]: { contains: validated.query, mode: "insensitive" },
          })),
        },
        select: validated.spec.select,
        orderBy: validated.spec.orderBy,
        take: validated.limit,
      }),
    );
  } catch (error) {
    if (error?.code) throw error;
    throw fail("TABLE_UNAVAILABLE");
  }
  const output = {
    table: validated.table,
    rows: Array.isArray(rows) ? rows : [],
  };
  if (
    Buffer.byteLength(JSON.stringify(output), "utf8") > MAX_TABLE_OUTPUT_BYTES
  ) {
    throw fail("TABLE_OUTPUT_LIMIT_EXCEEDED");
  }
  return output;
}

const ADAPTERS = Object.freeze({
  "foundation.table.search": Object.freeze({
    validate: validateTableInput,
    execute: searchTable,
  }),
  "foundation.pdf.read": Object.freeze({
    validate: validatePdfInput,
    execute: (input) => executeFileInWorker("foundation.pdf.read", input),
  }),
  "foundation.xlsx.read": Object.freeze({
    validate: validateXlsxInput,
    execute: (input) => executeFileInWorker("foundation.xlsx.read", input),
  }),
  "foundation.xlsx.create": Object.freeze({
    validate: validateCreateXlsxInput,
    execute: (input) => executeFileInWorker("foundation.xlsx.create", input),
  }),
});

function executeFileOperation(capabilityId, input) {
  if (capabilityId === "foundation.pdf.read") return readPdf(input);
  if (capabilityId === "foundation.xlsx.read") return readXlsx(input);
  if (capabilityId === "foundation.xlsx.create") return createXlsx(input);
  throw fail("CAPABILITY_NOT_AVAILABLE");
}

function executeFileInWorker(capabilityId, input) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      path.join(__dirname, "foundation-file-capability-worker.cjs"),
      {
        workerData: { capabilityId, input },
        resourceLimits: {
          maxOldGenerationSizeMb: 64,
          maxYoungGenerationSizeMb: 16,
          stackSizeMb: 4,
          codeRangeSizeMb: 16,
        },
      },
    );
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      finish(() => {
        void worker.terminate();
        reject(fail("CAPABILITY_TIMEOUT"));
      });
    }, EXECUTION_TIMEOUT_MS);
    worker.once("message", (message) => {
      finish(() => {
        void worker.terminate();
        if (message?.success !== true) {
          reject(fail(message?.code || "CAPABILITY_UNAVAILABLE"));
          return;
        }
        const output = message.output;
        if (output?.download === true && output.data instanceof Uint8Array) {
          output.data = Buffer.from(output.data);
        }
        resolve(output);
      });
    });
    worker.once("error", () => {
      finish(() => reject(fail("CAPABILITY_UNAVAILABLE")));
    });
    worker.once("exit", (code) => {
      if (code !== 0) {
        finish(() => reject(fail("CAPABILITY_UNAVAILABLE")));
      }
    });
  });
}

class FoundationDataCapabilityOrchestrator {
  constructor(options = {}) {
    this.registry = options.registry || chatCapabilityRegistry;
    this.prisma = options.prisma;
    this.clock = options.clock || (() => Date.now());
    this.signingKey = options.signingKey || crypto.randomBytes(32);
    this.reservedTokens = new Set();
    this.consumedTokens = new Set();
  }

  listCapabilityMatrix() {
    return CAPABILITY_MATRIX.map((entry) => ({ ...entry }));
  }

  prepare({ adminId, capabilityId, input }) {
    if (typeof adminId !== "string" || adminId.length < 1) {
      throw fail("ADMIN_AUTH_REQUIRED");
    }
    const capability = this.registry.get(capabilityId);
    const adapter = ADAPTERS[capabilityId];
    if (
      !capability ||
      capability.status !== "AVAILABLE" ||
      capability.callable !== true ||
      capability.requiresApproval !== true ||
      !adapter
    ) {
      throw fail("CAPABILITY_NOT_AVAILABLE");
    }
    adapter.validate(input);
    const expiresAt = this.clock() + APPROVAL_TTL_MS;
    const payload = Buffer.from(
      JSON.stringify({
        capabilityId,
        inputHash: inputHash(capabilityId, input),
        adminHash: crypto.createHash("sha256").update(adminId).digest("hex"),
        expiresAt,
        nonce: crypto.randomUUID(),
      }),
    ).toString("base64url");
    const signature = crypto
      .createHmac("sha256", this.signingKey)
      .update(payload)
      .digest("base64url");
    return {
      capabilityId,
      status: "AVAILABLE",
      approvalRequired: true,
      approvalToken: `${payload}.${signature}`,
      expiresAt,
    };
  }

  async execute({ adminId, capabilityId, input, approvalToken }) {
    const capability = this.registry.get(capabilityId);
    const adapter = ADAPTERS[capabilityId];
    if (
      typeof adminId !== "string" ||
      !capability ||
      capability.status !== "AVAILABLE" ||
      capability.callable !== true ||
      !adapter
    ) {
      throw fail("CAPABILITY_NOT_AVAILABLE");
    }
    adapter.validate(input);
    const tokenHash = this.verifyToken({
      adminId,
      capabilityId,
      input,
      approvalToken,
    });
    this.reservedTokens.add(tokenHash);
    try {
      const output = await adapter.execute(input, { prisma: this.prisma });
      this.finalizeToken(tokenHash);
      return output;
    } catch (error) {
      this.reservedTokens.delete(tokenHash);
      if (
        ![
          "CAPABILITY_TIMEOUT",
          "CAPABILITY_UNAVAILABLE",
          "TABLE_UNAVAILABLE",
        ].includes(error?.code)
      ) {
        this.consumeToken(tokenHash);
      }
      throw error;
    }
  }

  finalizeToken(tokenHash) {
    this.reservedTokens.delete(tokenHash);
    this.consumeToken(tokenHash);
  }

  consumeToken(tokenHash) {
    this.consumedTokens.add(tokenHash);
    if (this.consumedTokens.size > 10_000) {
      this.consumedTokens.delete(this.consumedTokens.values().next().value);
    }
  }

  verifyToken({ adminId, capabilityId, input, approvalToken }) {
    if (typeof approvalToken !== "string" || approvalToken.length > 2_000) {
      throw fail("APPROVAL_REQUIRED");
    }
    const tokenHash = crypto
      .createHash("sha256")
      .update(approvalToken)
      .digest("hex");
    if (
      this.reservedTokens.has(tokenHash) ||
      this.consumedTokens.has(tokenHash)
    ) {
      throw fail("APPROVAL_REPLAY");
    }
    const [payload, signature, extra] = approvalToken.split(".");
    if (!payload || !signature || extra) throw fail("APPROVAL_INVALID");
    const expected = crypto
      .createHmac("sha256", this.signingKey)
      .update(payload)
      .digest();
    const supplied = Buffer.from(signature, "base64url");
    if (
      supplied.length !== expected.length ||
      !crypto.timingSafeEqual(expected, supplied)
    ) {
      throw fail("APPROVAL_INVALID");
    }
    let parsed;
    try {
      parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch {
      throw fail("APPROVAL_INVALID");
    }
    const adminHash = crypto.createHash("sha256").update(adminId).digest("hex");
    if (
      parsed.capabilityId !== capabilityId ||
      parsed.inputHash !== inputHash(capabilityId, input) ||
      parsed.adminHash !== adminHash ||
      !Number.isFinite(parsed.expiresAt) ||
      parsed.expiresAt <= this.clock() ||
      typeof parsed.nonce !== "string"
    ) {
      throw fail("APPROVAL_INVALID");
    }
    return tokenHash;
  }
}

module.exports = {
  APPROVAL_TTL_MS,
  CAPABILITY_MATRIX,
  EXECUTION_TIMEOUT_MS,
  FoundationDataCapabilityOrchestrator,
  MAX_COLUMNS,
  MAX_FILE_BYTES,
  MAX_PDF_PAGES,
  MAX_ROWS_PER_SHEET,
  MAX_TABLE_ROWS,
  MAX_TOTAL_CELLS,
  TABLE_SPECS,
  validateCreateXlsxInput,
  validatePdfInput,
  validateTableInput,
  validateXlsxInput,
  executeFileOperation,
};
