BEGIN;

CREATE TABLE "FoundationPublicAccount" (
  "id" TEXT NOT NULL,
  "authUserId" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "phoneCountryCallingCode" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "identityLinkStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "orbisIdentityId" TEXT,
  "orbisDisplayId" TEXT,
  "orbisLifecycle" TEXT,
  "identityLinkReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FoundationPublicAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FoundationPublicAccount_status_check"
    CHECK ("status" IN ('ACTIVE', 'SUSPENDED')),
  CONSTRAINT "FoundationPublicAccount_identity_link_status_check"
    CHECK ("identityLinkStatus" IN ('PENDING', 'LINKED', 'REVIEW_REQUIRED', 'FAILED')),
  CONSTRAINT "FoundationPublicAccount_linked_identity_check"
    CHECK (
      "identityLinkStatus" <> 'LINKED'
      OR (
        "orbisIdentityId" IS NOT NULL
        AND "orbisDisplayId" IS NOT NULL
        AND "orbisLifecycle" IS NOT NULL
      )
    )
);

CREATE UNIQUE INDEX "FoundationPublicAccount_authUserId_key"
  ON "FoundationPublicAccount"("authUserId");

CREATE UNIQUE INDEX "FoundationPublicAccount_orbisIdentityId_key"
  ON "FoundationPublicAccount"("orbisIdentityId");

CREATE UNIQUE INDEX "FoundationPublicAccount_orbisDisplayId_key"
  ON "FoundationPublicAccount"("orbisDisplayId");

CREATE INDEX "FoundationPublicAccount_identityLinkStatus_status_idx"
  ON "FoundationPublicAccount"("identityLinkStatus", "status");

ALTER TABLE "FoundationPublicAccount"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "FoundationPublicAccount" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "FoundationPublicAccount" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "FoundationPublicAccount" FROM authenticated;
  END IF;
END
$$;

COMMIT;
