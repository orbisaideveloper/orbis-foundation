const { parentPort, workerData } = require("node:worker_threads");
const {
  executeFileOperation,
} = require("./FoundationDataCapabilityOrchestrator.cjs");

const SAFE_CODES = new Set([
  "CAPABILITY_NOT_AVAILABLE",
  "CAPABILITY_TIMEOUT",
  "FILE_CONTENT_INVALID",
  "FILE_NAME_INVALID",
  "FILE_SIZE_INVALID",
  "FILE_TYPE_INVALID",
  "PDF_PAGE_LIMIT_EXCEEDED",
  "PDF_PARSE_FAILED",
  "PDF_SIGNATURE_INVALID",
  "PDF_TEXT_LIMIT_EXCEEDED",
  "XLSX_CELL_INVALID",
  "XLSX_CELL_LIMIT_EXCEEDED",
  "XLSX_CONTAINER_INVALID",
  "XLSX_CREATE_FAILED",
  "XLSX_DIMENSION_LIMIT_EXCEEDED",
  "XLSX_EXPANDED_SIZE_INVALID",
  "XLSX_FORMULA_REJECTED",
  "XLSX_OUTPUT_SIZE_INVALID",
  "XLSX_PARSE_FAILED",
  "XLSX_SHEET_INVALID",
  "XLSX_SHEET_LIMIT_EXCEEDED",
  "XLSX_SHEET_NAME_INVALID",
  "XLSX_SIGNATURE_INVALID",
  "XLSX_UNSAFE_CONTENT",
]);

Promise.resolve()
  .then(() => executeFileOperation(workerData.capabilityId, workerData.input))
  .then((output) => parentPort.postMessage({ success: true, output }))
  .catch((error) => {
    const code = error?.code || error?.message;
    parentPort.postMessage({
      success: false,
      code: SAFE_CODES.has(code) ? code : "CAPABILITY_UNAVAILABLE",
    });
  });
