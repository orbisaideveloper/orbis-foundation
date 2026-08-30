const express = require("express");

function safeCode(error) {
  const code = error?.code || error?.message;
  return typeof code === "string" && /^LEARNING_[A-Z_]+$/.test(code)
    ? code
    : "LEARNING_UNAVAILABLE";
}

function statusFor(code) {
  if (
    code === "LEARNING_STORAGE_UNAVAILABLE" ||
    code === "LEARNING_EVENT_STORAGE_UNAVAILABLE" ||
    code === "LEARNING_UNAVAILABLE"
  ) {
    return 503;
  }
  if (code === "LEARNING_RECORD_NOT_FOUND") return 404;
  if (code === "LEARNING_PATTERN_NOT_FOUND") return 404;
  return 400;
}

function sendLearningError(res, error) {
  const code = safeCode(error);
  return res.status(statusFor(code)).json({
    error: { category: "learning", code },
  });
}

function createLearningRouter(options) {
  const router = express.Router();
  const service = options.service;
  router.use(options.authMiddleware);
  router.use(options.rateLimiter);

  router.post("/preview", async (req, res) => {
    try {
      const preview = await service.preview({
        consent: req.body?.consent,
        sourceText: req.body?.sourceText,
      });
      return res.json(preview);
    } catch (error) {
      return sendLearningError(res, error);
    }
  });

  router.post("/approve", async (req, res) => {
    try {
      const result = await service.approve({
        consent: req.body?.consent,
        candidate: req.body?.candidate,
        approvalToken: req.body?.approvalToken,
      });
      return res.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
      return sendLearningError(res, error);
    }
  });

  router.post("/events", async (req, res) => {
    try {
      const result = await service.recordEventBatch(req.body);
      return res.status(result.accepted > 0 ? 202 : 200).json(result);
    } catch (error) {
      return sendLearningError(res, error);
    }
  });

  router.get("/review-patterns", async (_req, res) => {
    try {
      return res.json({ patterns: await service.listReviewPatterns() });
    } catch (error) {
      return sendLearningError(res, error);
    }
  });

  router.post("/review-patterns/preview", async (req, res) => {
    try {
      return res.json(
        await service.previewReviewPattern({
          consent: req.body?.consent,
          pattern: req.body?.pattern,
        }),
      );
    } catch (error) {
      return sendLearningError(res, error);
    }
  });

  router.get("/records", async (_req, res) => {
    try {
      return res.json({ records: await service.list() });
    } catch (error) {
      return sendLearningError(res, error);
    }
  });

  router.delete("/records/:id", async (req, res) => {
    try {
      const result = await service.delete(req.params.id);
      if (!result.deleted) {
        return res.status(404).json({
          error: { category: "learning", code: "LEARNING_RECORD_NOT_FOUND" },
        });
      }
      return res.json(result);
    } catch (error) {
      return sendLearningError(res, error);
    }
  });

  return router;
}

module.exports = { createLearningRouter };
