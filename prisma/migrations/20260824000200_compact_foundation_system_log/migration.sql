ALTER TABLE public."FoundationSystemLog"
ADD COLUMN "category" TEXT NOT NULL DEFAULT 'FOUNDATION',
ADD COLUMN "severity" TEXT NOT NULL DEFAULT 'INFO',
ADD COLUMN "fingerprint" TEXT,
ADD COLUMN "count" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "firstSeen" TIMESTAMP(3),
ADD COLUMN "lastSeen" TIMESTAMP(3),
ADD COLUMN "retentionUntil" TIMESTAMP(3);

UPDATE public."FoundationSystemLog"
SET
    "category" = CASE
        WHEN "source" IN ('DATABASE', 'FOUNDATION', 'BRIDGE', 'SYSTEM', 'TELEMETRY')
            THEN "source"
        ELSE 'FOUNDATION'
    END,
    "severity" = CASE
        WHEN "level" IN ('INFO', 'WARN', 'ERROR') THEN "level"
        ELSE 'INFO'
    END,
    "fingerprint" = md5('foundation-system-log:' || "id"),
    "firstSeen" = "createdAt",
    "lastSeen" = "createdAt",
    "retentionUntil" = "createdAt" + CASE
        WHEN "level" = 'INFO' THEN INTERVAL '7 days'
        ELSE INTERVAL '30 days'
    END;

ALTER TABLE public."FoundationSystemLog"
ALTER COLUMN "fingerprint" SET NOT NULL,
ALTER COLUMN "firstSeen" SET NOT NULL,
ALTER COLUMN "lastSeen" SET NOT NULL,
ALTER COLUMN "retentionUntil" SET NOT NULL;

CREATE UNIQUE INDEX "FoundationSystemLog_fingerprint_key"
ON public."FoundationSystemLog"("fingerprint");

CREATE INDEX "FoundationSystemLog_retentionUntil_idx"
ON public."FoundationSystemLog"("retentionUntil");

CREATE INDEX "FoundationSystemLog_category_severity_lastSeen_idx"
ON public."FoundationSystemLog"("category", "severity", "lastSeen");

ALTER TABLE public."FoundationSystemLog" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public."FoundationSystemLog" FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public."FoundationSystemLog" FROM authenticated;
