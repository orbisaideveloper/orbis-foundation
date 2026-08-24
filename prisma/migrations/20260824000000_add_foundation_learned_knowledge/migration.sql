CREATE TABLE "FoundationLearnedKnowledge" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deduplicationHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoundationLearnedKnowledge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FoundationLearnedKnowledge_deduplicationHash_key"
ON "FoundationLearnedKnowledge"("deduplicationHash");

ALTER TABLE public."FoundationLearnedKnowledge" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public."FoundationLearnedKnowledge" FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public."FoundationLearnedKnowledge" FROM authenticated;
