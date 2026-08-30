-- Admin-managed product definitions. Customer accounting data is deliberately
-- not stored in this registry.
CREATE TABLE "FoundationManagedProductModel" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoundationManagedProductModel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FoundationManagedProductModelVersion" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "lifecycle" TEXT NOT NULL DEFAULT 'DRAFT',
    "definition" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "FoundationManagedProductModelVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FoundationManagedProductModelEvent" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelVersionId" TEXT,
    "action" TEXT NOT NULL,
    "actorAdminId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoundationManagedProductModelEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FoundationManagedProductModel_slug_key"
ON "FoundationManagedProductModel"("slug");

CREATE UNIQUE INDEX "FoundationManagedProductModelVersion_modelId_sequence_key"
ON "FoundationManagedProductModelVersion"("modelId", "sequence");

CREATE INDEX "FoundationManagedProductModelVersion_modelId_lifecycle_idx"
ON "FoundationManagedProductModelVersion"("modelId", "lifecycle");

CREATE INDEX "FoundationManagedProductModelEvent_modelId_createdAt_idx"
ON "FoundationManagedProductModelEvent"("modelId", "createdAt");

CREATE INDEX "FoundationManagedProductModelEvent_modelVersionId_idx"
ON "FoundationManagedProductModelEvent"("modelVersionId");

-- The release state is a strict pair: one editable DRAFT and one public
-- PUBLISHED snapshot at most for each model. Historical releases become
-- ARCHIVED at publish time.
CREATE UNIQUE INDEX "FoundationManagedProductModel_one_draft_per_model"
ON "FoundationManagedProductModelVersion"("modelId")
WHERE "lifecycle" = 'DRAFT';

CREATE UNIQUE INDEX "FoundationManagedProductModel_one_published_per_model"
ON "FoundationManagedProductModelVersion"("modelId")
WHERE "lifecycle" = 'PUBLISHED';

ALTER TABLE "FoundationManagedProductModelVersion"
ADD CONSTRAINT "FoundationManagedProductModelVersion_modelId_fkey"
FOREIGN KEY ("modelId") REFERENCES "FoundationManagedProductModel"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FoundationManagedProductModelEvent"
ADD CONSTRAINT "FoundationManagedProductModelEvent_modelId_fkey"
FOREIGN KEY ("modelId") REFERENCES "FoundationManagedProductModel"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FoundationManagedProductModelEvent"
ADD CONSTRAINT "FoundationManagedProductModelEvent_modelVersionId_fkey"
FOREIGN KEY ("modelVersionId") REFERENCES "FoundationManagedProductModelVersion"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- These tables are server-admin-only. They are not exposed to browser users
-- through Supabase Data API, even if its exposed-schema setting changes.
ALTER TABLE "FoundationManagedProductModel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FoundationManagedProductModelVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FoundationManagedProductModelEvent" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE "FoundationManagedProductModel" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "FoundationManagedProductModelVersion" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "FoundationManagedProductModelEvent" FROM PUBLIC;

REVOKE ALL PRIVILEGES ON TABLE "FoundationManagedProductModel" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE "FoundationManagedProductModelVersion" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE "FoundationManagedProductModelEvent" FROM anon, authenticated;
