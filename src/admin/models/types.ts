export interface ManagedProductModule {
  slug: string;
  name: string;
  lifecycle: string;
  workflow: string[];
  workspace: string[];
  dataContract: {
    moneyUnit: string;
    rateUnit: string;
    entities: string[];
    rules: string[];
  };
  aiSkills: Array<{
    slug: string;
    name: string;
    source: string;
  }>;
  aiAnalysis: string;
}

export interface ManagedProductDefinition {
  schemaVersion: number;
  product: {
    name: string;
    distribution: {
      current: string;
      future: string;
    };
  };
  releasePolicy: {
    publicResolver: string;
    nextCurrentVersion: string;
  };
  aiBoundary: {
    purpose: string;
    dataScope: string;
    writeAccess: string;
    webSearch: string;
  };
  modules: ManagedProductModule[];
}

export interface ManagedProductModelVersion {
  id: string;
  sequence: number;
  lifecycle: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  definition: ManagedProductDefinition;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  reviewStatus: "NOT_RUN" | "PASSED" | "FAILED";
  reviewReport: {
    status: "PASSED" | "FAILED";
    contractChecks: Array<{ name: string; passed: boolean }>;
    coreChecks: Array<{ name: string; passed: boolean; code?: string }>;
    canonicalSummary: Record<string, unknown> | null;
  } | null;
  reviewedAt: string | null;
  reviewedByAdminId: string | null;
}

export interface ManagedProductModel {
  id: string;
  slug: string;
  displayName: string;
  category: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  currentVersion: ManagedProductModelVersion | null;
  publishedVersion: ManagedProductModelVersion | null;
  versionHistory: ManagedProductModelVersion[];
}

export interface ManagedProductModelsResponse {
  models: ManagedProductModel[];
}

export interface PublishManagedProductModelResponse {
  model: ManagedProductModel;
}

export type ReviewManagedProductModelResponse =
  PublishManagedProductModelResponse;
