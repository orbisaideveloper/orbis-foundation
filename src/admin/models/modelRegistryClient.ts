import { authenticatedAdminFetch, readAdminJson } from "../auth/adminFetch";
import type {
  ManagedProductModel,
  ManagedProductModelsResponse,
  PublishManagedProductModelResponse,
  ReviewManagedProductModelResponse,
} from "./types";

export async function loadManagedProductModels(): Promise<
  ManagedProductModel[]
> {
  const response =
    await readAdminJson<ManagedProductModelsResponse>("/api/admin/models");
  return response.models;
}

async function runModelAction<T extends { model: ManagedProductModel }>(
  slug: string,
  action: "publish" | "review",
  message: string,
): Promise<ManagedProductModel> {
  const response = await authenticatedAdminFetch(
    `/api/admin/models/${encodeURIComponent(slug)}/${action}`,
    { method: "POST" },
  );
  const body = (await response.json()) as Partial<T>;
  if (!response.ok || !body.model) throw new Error(message);
  return body.model;
}

export async function publishManagedProductModel(
  slug: string,
): Promise<ManagedProductModel> {
  return runModelAction<PublishManagedProductModelResponse>(
    slug,
    "publish",
    "The Accounting AI version could not be published.",
  );
}

export async function reviewManagedProductModel(
  slug: string,
): Promise<ManagedProductModel> {
  return runModelAction<ReviewManagedProductModelResponse>(
    slug,
    "review",
    "The Accounting AI draft review could not be completed.",
  );
}
