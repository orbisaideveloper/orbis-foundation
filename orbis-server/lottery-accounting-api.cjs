const express = require("express");
const {
  createLotteryAccountingService,
} = require("./lottery-accounting-service.cjs");

const CLIENT_ERROR_CODES = new Set([
  "DATA_INTEGRITY_ERROR",
  "INVALID_DATE",
  "INVALID_INTEGER",
  "INVALID_PAYMENT",
  "INVALID_PAYMENT_DIRECTION",
  "INVALID_PARTY_TYPE",
  "INVALID_PERIOD_RANGE",
  "INVALID_SALE",
  "INVALID_SETTLEMENT",
  "INVALID_STOCK_QUANTITY",
  "INVALID_STOCK_TYPE",
  "NEGATIVE_STOCK",
  "NEGATIVE_VALUE",
  "ORGANIZATION_NOT_FOUND",
  "PARTY_NOT_FOUND",
  "PAYMENT_NOT_FOUND",
  "PAYMENT_SPLIT_MISMATCH",
  "RATE_OUT_OF_RANGE",
  "REQUIRED_FIELD",
  "RETURN_EXCEEDS_DISPATCH",
  "SALE_NOT_FOUND",
  "SETTLEMENT_EXCEEDS_BALANCE",
  "UNBALANCED_LEDGER",
  "UNVERIFIED_SUMMARY",
  "ZERO_PAYMENT",
]);

const NOT_FOUND_CODES = new Set([
  "PARTY_NOT_FOUND",
  "PAYMENT_NOT_FOUND",
  "SALE_NOT_FOUND",
  "ORGANIZATION_NOT_FOUND",
]);

function sendAccountingError(res, error) {
  const code = CLIENT_ERROR_CODES.has(error?.code)
    ? error.code
    : "LOTTERY_ACCOUNTING_UNAVAILABLE";
  const status = NOT_FOUND_CODES.has(code)
    ? 404
    : code === "SETTLEMENT_EXCEEDS_BALANCE"
      ? 409
      : code === "LOTTERY_ACCOUNTING_UNAVAILABLE"
        ? 503
        : 400;
  return res.status(status).json({
    success: false,
    error: {
      category: "lottery_accounting",
      code,
      ...(error?.field ? { field: error.field } : {}),
    },
  });
}

function createLotteryAccountingRouter({
  prisma,
  authMiddleware,
  service: suppliedService,
}) {
  const router = express.Router();
  const service = suppliedService || createLotteryAccountingService({ prisma });
  router.use(authMiddleware);

  router.get("/organizations", async (_req, res) => {
    try {
      const organizations = await service.listOrganizations();
      res.setHeader("Cache-Control", "no-store");
      return res.json({ organizations });
    } catch (error) {
      return sendAccountingError(res, error);
    }
  });

  router.post("/organizations", async (req, res) => {
    try {
      const organization = await service.createOrganization(
        req.body,
        req.adminUser?.id,
      );
      return res.status(201).json({ organization });
    } catch (error) {
      return sendAccountingError(res, error);
    }
  });

  router.post("/parties", async (req, res) => {
    try {
      const party = await service.createParty(req.body, req.adminUser?.id);
      return res.status(201).json({ party });
    } catch (error) {
      return sendAccountingError(res, error);
    }
  });

  router.post("/periods", async (req, res) => {
    try {
      const period = await service.createPeriod(req.body, req.adminUser?.id);
      return res.status(201).json({ period });
    } catch (error) {
      return sendAccountingError(res, error);
    }
  });

  router.post("/stock-movements", async (req, res) => {
    try {
      const movement = await service.recordStockMovement(
        req.body,
        req.adminUser?.id,
      );
      return res.status(201).json({ movement });
    } catch (error) {
      return sendAccountingError(res, error);
    }
  });

  router.post("/sales", async (req, res) => {
    try {
      const result = await service.recordSale(req.body, req.adminUser?.id);
      return res.status(201).json(result);
    } catch (error) {
      return sendAccountingError(res, error);
    }
  });

  router.post("/sales/preview", async (req, res) => {
    try {
      const preview = service.previewSale(req.body);
      res.setHeader("Cache-Control", "no-store");
      return res.json(preview);
    } catch (error) {
      return sendAccountingError(res, error);
    }
  });

  router.post("/payments", async (req, res) => {
    try {
      const result = await service.recordPayment(req.body, req.adminUser?.id);
      return res.status(201).json(result);
    } catch (error) {
      return sendAccountingError(res, error);
    }
  });

  router.post("/settlements", async (req, res) => {
    try {
      const settlement = await service.recordSettlement(
        req.body,
        req.adminUser?.id,
      );
      return res.status(201).json({ settlement });
    } catch (error) {
      return sendAccountingError(res, error);
    }
  });

  router.get("/summary", async (req, res) => {
    try {
      const summary = await service.getVerifiedSummary(req.query);
      res.setHeader("Cache-Control", "no-store");
      return res.json({ summary });
    } catch (error) {
      return sendAccountingError(res, error);
    }
  });

  router.get("/workspace", async (req, res) => {
    try {
      const workspace = await service.getWorkspace(req.query);
      res.setHeader("Cache-Control", "no-store");
      return res.json({ workspace });
    } catch (error) {
      return sendAccountingError(res, error);
    }
  });

  router.get("/analysis", async (req, res) => {
    try {
      const result = await service.analyzeVerifiedAccounting(req.query);
      res.setHeader("Cache-Control", "no-store");
      return res.json(result);
    } catch (error) {
      return sendAccountingError(res, error);
    }
  });

  return router;
}

module.exports = { createLotteryAccountingRouter, sendAccountingError };
