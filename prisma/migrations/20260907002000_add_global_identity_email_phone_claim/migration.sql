BEGIN;

ALTER TABLE "FoundationAccountingParty"
  ADD COLUMN "email" TEXT,
  ADD COLUMN "emailNormalized" TEXT,
  ADD COLUMN "phoneNormalized" TEXT;

UPDATE "FoundationAccountingParty"
SET "emailNormalized" = lower(trim("email"))
WHERE "email" IS NOT NULL
  AND length(trim("email")) BETWEEN 3 AND 254
  AND trim("email") ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';

UPDATE "FoundationAccountingParty"
SET "phoneNormalized" = regexp_replace(trim("phone"), '[()\s.\-]', '', 'g')
WHERE "phone" IS NOT NULL
  AND regexp_replace(trim("phone"), '[()\s.\-]', '', 'g')
      ~ '^\+[1-9][0-9]{7,14}$';

CREATE INDEX "FoundationAccountingParty_emailNormalized_status_idx"
  ON "FoundationAccountingParty"("emailNormalized", "status");

CREATE INDEX "FoundationAccountingParty_phoneNormalized_status_idx"
  ON "FoundationAccountingParty"("phoneNormalized", "status");

CREATE TABLE "FoundationAccountingUserIdentity" (
  "userId" TEXT NOT NULL,
  "orbisId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FoundationAccountingUserIdentity_pkey" PRIMARY KEY ("userId")
);

CREATE UNIQUE INDEX "FoundationAccountingUserIdentity_orbisId_key"
  ON "FoundationAccountingUserIdentity"("orbisId");

CREATE TABLE "FoundationAccountingPartyClaim" (
  "id" TEXT NOT NULL,
  "partyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "claimMethod" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'VERIFIED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FoundationAccountingPartyClaim_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FoundationAccountingPartyClaim_claim_method_check"
    CHECK ("claimMethod" IN ('VERIFIED_EMAIL', 'VERIFIED_PHONE')),
  CONSTRAINT "FoundationAccountingPartyClaim_status_check"
    CHECK ("status" IN ('VERIFIED', 'REVOKED'))
);

ALTER TABLE "FoundationAccountingPartyClaim"
  ADD CONSTRAINT "FoundationAccountingPartyClaim_partyId_fkey"
  FOREIGN KEY ("partyId")
  REFERENCES "FoundationAccountingParty"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

CREATE UNIQUE INDEX "FoundationAccountingPartyClaim_partyId_key"
  ON "FoundationAccountingPartyClaim"("partyId");

CREATE INDEX "FoundationAccountingPartyClaim_userId_status_idx"
  ON "FoundationAccountingPartyClaim"("userId", "status");

ALTER TABLE "FoundationAccountingUserIdentity"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "FoundationAccountingPartyClaim"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "FoundationAccountingUserIdentity" FROM PUBLIC;
REVOKE ALL ON TABLE "FoundationAccountingPartyClaim" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "FoundationAccountingUserIdentity" FROM anon;
    REVOKE ALL ON TABLE "FoundationAccountingPartyClaim" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "FoundationAccountingUserIdentity" FROM authenticated;
    REVOKE ALL ON TABLE "FoundationAccountingPartyClaim" FROM authenticated;
  END IF;
END
$$;

COMMIT;
