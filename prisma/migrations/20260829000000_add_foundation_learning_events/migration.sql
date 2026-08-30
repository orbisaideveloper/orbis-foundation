CREATE TABLE "FoundationLearningEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "decisionRoute" TEXT NOT NULL,
    "decisionIntent" TEXT NOT NULL,
    "decisionConfidence" TEXT NOT NULL,
    "evidenceRequired" BOOLEAN NOT NULL,
    "decisionReason" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "feedbackCode" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deduplicationHash" TEXT NOT NULL,

    CONSTRAINT "FoundationLearningEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FoundationLearningEvent_deduplicationHash_key"
ON "FoundationLearningEvent"("deduplicationHash");

CREATE INDEX "FoundationLearningEvent_receivedAt_idx"
ON "FoundationLearningEvent"("receivedAt");

CREATE INDEX "FoundationLearningEvent_decisionRoute_outcome_idx"
ON "FoundationLearningEvent"("decisionRoute", "outcome");

ALTER TABLE public."FoundationLearningEvent" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public."FoundationLearningEvent" FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public."FoundationLearningEvent" FROM authenticated;
