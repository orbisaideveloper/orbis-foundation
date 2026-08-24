const express = require("express");

const SAFE_ERROR_CODES = new Set([
  "ADMIN_AUTH_REQUIRED",
  "APPROVAL_INVALID",
  "APPROVAL_REPLAY",
  "APPROVAL_REQUIRED",
  "CAPABILITY_INPUT_INVALID",
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
  "TABLE_COLUMNS_INVALID",
  "TABLE_LIMIT_INVALID",
  "TABLE_NOT_ALLOWED",
  "TABLE_OUTPUT_LIMIT_EXCEEDED",
  "TABLE_QUERY_INVALID",
  "TABLE_UNAVAILABLE",
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

function safeErrorCode(error) {
  const code = error?.code || error?.message;
  return SAFE_ERROR_CODES.has(code) ? code : "CAPABILITY_UNAVAILABLE";
}

function statusFor(code) {
  if (
    [
      "CAPABILITY_TIMEOUT",
      "CAPABILITY_UNAVAILABLE",
      "TABLE_UNAVAILABLE",
    ].includes(code)
  ) {
    return 503;
  }
  if (code === "CAPABILITY_NOT_AVAILABLE") return 404;
  return 400;
}

function sendCapabilityError(res, error) {
  const code = safeErrorCode(error);
  return res.status(statusFor(code)).json({
    success: false,
    error: { category: "foundation_capability", code },
  });
}

function createFoundationCapabilityRouter(options) {
  const router = express.Router();
  const orchestrator = options.orchestrator;
  router.use(options.authMiddleware);
  router.use(options.rateLimiter);

  router.get("/status", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    return res.json({ capabilities: orchestrator.listCapabilityMatrix() });
  });

  router.post("/prepare", (req, res) => {
    try {
      const result = orchestrator.prepare({
        adminId: req.adminUser?.id,
        capabilityId: req.body?.capabilityId,
        input: req.body?.input,
      });
      res.setHeader("Cache-Control", "no-store");
      return res.json(result);
    } catch (error) {
      return sendCapabilityError(res, error);
    }
  });

  router.post("/execute", async (req, res) => {
    try {
      const output = await orchestrator.execute({
        adminId: req.adminUser?.id,
        capabilityId: req.body?.capabilityId,
        input: req.body?.input,
        approvalToken: req.body?.approvalToken,
      });
      res.setHeader("Cache-Control", "no-store");
      if (output?.download === true && Buffer.isBuffer(output.data)) {
        res.setHeader("Content-Type", output.mimeType);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${output.fileName}"`,
        );
        res.setHeader("Content-Length", String(output.data.length));
        return res.send(output.data);
      }
      return res.json({ success: true, status: "AVAILABLE", output });
    } catch (error) {
      return sendCapabilityError(res, error);
    }
  });

  return router;
}

module.exports = { createFoundationCapabilityRouter, safeErrorCode };
