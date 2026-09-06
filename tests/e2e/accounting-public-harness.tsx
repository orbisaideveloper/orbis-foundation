import React from "react";
import ReactDOM from "react-dom/client";
import "../../src/index.css";
import { AccountingPublicView } from "../../src/admin/dashboard/sections/AccountingPublicView";
import { ACCOUNTING_APPEARANCE_STORAGE_KEY } from "../../src/admin/dashboard/sections/accountingAppearance";
import { ACCOUNTING_LANGUAGE_STORAGE_KEY } from "../../src/admin/dashboard/sections/accountingI18n";
import type { LotteryAccountingClient } from "../../src/admin/models/lotteryAccountingClient";
import type { ManagedProductModelVersion } from "../../src/admin/models/types";
import { organization, workspace } from "./fixtures/lotteryWorkspaceFixture";

const FIXTURE_TIMESTAMP = "2026-09-04T00:00:00.000Z";

const previewVersion: ManagedProductModelVersion = {
  id: "accounting-preview-v1",
  sequence: 1,
  lifecycle: "DRAFT",
  definition: {
    schemaVersion: 1,
    product: {
      name: "ORBiS Accounting AI",
      distribution: {
        current: "PWA",
        future: "Play Store",
      },
    },
    releasePolicy: {
      publicResolver: "PUBLISHED_VERSION_ONLY",
      nextCurrentVersion: "NEW_DRAFT",
    },
    aiBoundary: {
      purpose: "Read-only Accounting analysis",
      dataScope: "Accounting module only",
      writeAccess: "READ_ONLY",
      webSearch: "DISABLED",
    },
    modules: [],
  },
  createdAt: FIXTURE_TIMESTAMP,
  updatedAt: FIXTURE_TIMESTAMP,
  publishedAt: null,
  reviewStatus: "PASSED",
  reviewReport: {
    status: "PASSED",
    contractChecks: [],
    coreChecks: [],
    canonicalSummary: null,
  },
  reviewedAt: FIXTURE_TIMESTAMP,
  reviewedByAdminId: "e2e-admin",
};

const api = {
  listOrganizations: async () => [organization],
  loadWorkspace: async () => workspace,
} as unknown as LotteryAccountingClient;

window.localStorage.setItem(
  ACCOUNTING_APPEARANCE_STORAGE_KEY,
  "SIGNATURE_LIGHT",
);
window.localStorage.setItem(ACCOUNTING_LANGUAGE_STORAGE_KEY, "EN");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <main className="min-h-screen bg-slate-100 p-2">
      <AccountingPublicView
        mode="PREVIEW"
        version={previewVersion}
        api={api}
        onBack={() => undefined}
        viewerName="Test User"
      />
    </main>
  </React.StrictMode>,
);
