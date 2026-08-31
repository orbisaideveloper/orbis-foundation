const express = require("express");
const {
  createLotteryAccountingService,
} = require("./lottery-accounting-service.cjs");

const CLIENT_ERROR_CODES = new Set([
  "DATA_INTEGRITY_ERROR",
  "DRAFT_SALE_NOT_FOUND",
  "INVALID_FINANCIAL_YEAR",
  "INVALID_DATE",
  "INVALID_INTEGER",
  "INVALID_PAYMENT",
  "INVALID_PAYMENT_DIRECTION",
  "INVALID_PARTY_TYPE",
  "INVALID_PERIOD_RANGE",
  "INVALID_SALE",
  "INVALID_SALE_PARTY",
  "INVALID_SALE_QUANTITY",
  "INVALID_SETTLEMENT",
  "INVALID_STOCK_QUANTITY",
  "INVALID_STOCK_TYPE",
  "NEGATIVE_STOCK",
  "NEGATIVE_VALUE",
  "ORGANIZATION_NOT_FOUND",
  "PARTY_NOT_FOUND",
  "PARTY_PROFILE_REQUIRED",
  "PAYMENT_NOT_FOUND",
  "PAYMENT_SPLIT_MISMATCH",
  "RATE_OUT_OF_RANGE",
  "REQUIRED_FIELD",
  "RETURN_EXCEEDS_DISPATCH",
  "RETURN_TOTAL_MISMATCH",
  "SALE_HAS_SETTLEMENTS",
  "SALE_NOT_FOUND",
  "SETTLEMENT_EXCEEDS_BALANCE",
  "UNBALANCED_LEDGER",
  "UNVERIFIED_SUMMARY",
  "ZERO_PAYMENT",
]);

const NOT_FOUND_CODES = new Set([
  "PARTY_NOT_FOUND",
  "DRAFT_SALE_NOT_FOUND",
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
    : code === "SETTLEMENT_EXCEEDS_BALANCE" || code === "SALE_HAS_SETTLEMENTS"
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

  function saleAction(handler, successStatus = 200) {
    return async (req, res) => {
      try {
        const result = await handler(
          { ...req.body, saleId: req.params.saleId },
          req.adminUser?.id,
        );
        return res.status(successStatus).json(result);
      } catch (error) {
        return sendAccountingError(res, error);
      }
    };
  }

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

  router.patch("/parties/:partyId/profile", async (req, res) => {
    try {
      const party = await service.updatePartyProfile(
        { ...req.body, partyId: req.params.partyId },
        req.adminUser?.id,
      );
      return res.json({ party });
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

  router.post("/periods/financial-year", async (req, res) => {
    try {
      const period = await service.createFinancialYearPeriod(
        req.body,
        req.adminUser?.id,
      );
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

  router.post("/daily-seller-drafts", async (req, res) => {
    try {
      const result = await service.createDailySellerDraft(
        req.body,
        req.adminUser?.id,
      );
      return res.status(201).json(result);
    } catch (error) {
      return sendAccountingError(res, error);
    }
  });

  router.patch(
    "/daily-seller-drafts/:saleId",
    saleAction(service.updateDailySellerDraft),
  );

  router.delete(
    "/daily-seller-drafts/:saleId",
    saleAction(service.deleteDailySellerDraft),
  );

  router.post(
    "/daily-seller-drafts/:saleId/post",
    saleAction(service.postDailySellerDraft),
  );

  router.post(
    "/sales/:saleId/correct",
    saleAction(service.correctPostedSale, 201),
  );

  router.post("/sales/preview", async (req, res) => {
    try {
      const preview = await service.previewSale(req.body);
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
