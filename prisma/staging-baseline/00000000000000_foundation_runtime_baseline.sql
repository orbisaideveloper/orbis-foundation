-- ORBIS Foundation
-- Fresh staging bootstrap baseline only.
--
-- Purpose:
-- Reconstruct Foundation runtime tables that pre-date the committed
-- prisma/migrations chain. Apply this once to a verified empty staging DB
-- BEFORE the normal committed migrations.
--
-- DO NOT copy production data.
-- DO NOT treat this as a production migration.
--
-- FoundationSystemLog intentionally uses its historical pre-compact shape.
-- 20260824000200_compact_foundation_system_log must add the later columns.

CREATE TABLE public."FoundationAdminAuditLog" (
  "id" TEXT NOT NULL,
  "commitHash" TEXT,
  "actionType" TEXT NOT NULL DEFAULT 'GIT_PUSH',
  "changedFiles" JSONB NOT NULL,
  "commitMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FoundationAdminAuditLog_pkey"
    PRIMARY KEY ("id")
);

CREATE TABLE public."FoundationAdminMetric" (
  "id" TEXT NOT NULL,
  "ramUsageMb" DOUBLE PRECISION,
  "cpuLoad" DOUBLE PRECISION,
  "status" TEXT NOT NULL DEFAULT 'ONLINE',
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FoundationAdminMetric_pkey"
    PRIMARY KEY ("id")
);

CREATE TABLE public."FoundationBrainKnowledge" (
  "id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "tags" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FoundationBrainKnowledge_pkey"
    PRIMARY KEY ("id")
);

CREATE TABLE public."FoundationSourceCodeHistory" (
  "id" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "versionHash" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FoundationSourceCodeHistory_pkey"
    PRIMARY KEY ("id")
);

CREATE TABLE public."FoundationSystemLog" (
  "id" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "timestamp" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FoundationSystemLog_pkey"
    PRIMARY KEY ("id")
);

CREATE TABLE public."FoundationTimeMachine" (
  "id" TEXT NOT NULL,
  "commitId" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT DEFAULT 'SUCCESS',
  "errorMessage" TEXT DEFAULT '',

  CONSTRAINT "FoundationTimeMachine_pkey"
    PRIMARY KEY ("id")
);

CREATE TABLE public."FoundationUserMemory" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "factKey" TEXT NOT NULL,
  "factValue" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FoundationUserMemory_pkey"
    PRIMARY KEY ("id")
);

-- These Foundation runtime tables are server-owned.
-- Keep clean staging closed to browser roles by default.
ALTER TABLE public."FoundationAdminAuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FoundationAdminMetric" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FoundationBrainKnowledge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FoundationSourceCodeHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FoundationSystemLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FoundationTimeMachine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FoundationUserMemory" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public."FoundationAdminAuditLog",
  public."FoundationAdminMetric",
  public."FoundationBrainKnowledge",
  public."FoundationSourceCodeHistory",
  public."FoundationSystemLog",
  public."FoundationTimeMachine",
  public."FoundationUserMemory"
FROM PUBLIC, anon, authenticated;
