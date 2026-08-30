export interface ManagedProductModule {
  slug: string;
  name: string;
  lifecycle: string;
  workflow: string[];
  aiAnalysis: string;
}

export interface ManagedProductDefinition {
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
}

export interface ManagedProductModelsResponse {
  models: ManagedProductModel[];
}

export interface PublishManagedProductModelResponse {
  model: ManagedProductModel;
}
