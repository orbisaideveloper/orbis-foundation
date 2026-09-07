BEGIN;

CREATE TABLE "FoundationAccountingOrganizationMembership" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'MEMBER',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FoundationAccountingOrganizationMembership_pkey"
    PRIMARY KEY ("id"),
  CONSTRAINT "FoundationAccountingOrganizationMembership_role_check"
    CHECK ("role" IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER')),
  CONSTRAINT "FoundationAccountingOrganizationMembership_status_check"
    CHECK ("status" IN ('ACTIVE', 'REVOKED'))
);

ALTER TABLE "FoundationAccountingOrganizationMembership"
  ADD CONSTRAINT "FoundationAccountingOrganizationMembership_organizationId_fkey"
  FOREIGN KEY ("organizationId")
  REFERENCES "FoundationAccountingOrganization"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

CREATE UNIQUE INDEX "FoundationAccountingOrganizationMembership_organizationId_userId_key"
  ON "FoundationAccountingOrganizationMembership"("organizationId", "userId");

CREATE INDEX "FoundationAccountingOrganizationMembership_userId_status_idx"
  ON "FoundationAccountingOrganizationMembership"("userId", "status");

CREATE INDEX "FoundationAccountingOrganizationMembership_organizationId_status_idx"
  ON "FoundationAccountingOrganizationMembership"("organizationId", "status");

ALTER TABLE "FoundationAccountingOrganizationMembership"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "FoundationAccountingOrganizationMembership" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "FoundationAccountingOrganizationMembership" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "FoundationAccountingOrganizationMembership" FROM authenticated;
  END IF;
END
$$;

COMMIT;
