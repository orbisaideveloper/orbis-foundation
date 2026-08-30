import { authenticatedAdminFetch, readAdminJson } from "../auth/adminFetch";
import type {
  ManagedProductModel,
  ManagedProductModelsResponse,
  PublishManagedProductModelResponse,
} from "./types";

export async function loadManagedProductModels(): Promise<
  ManagedProductModel[]
> {
  const response =
    await readAdminJson<ManagedProductModelsResponse>("/api/admin/models");
  return response.models;
}

export async function publishManagedProductModel(
  slug: string,
): Promise<ManagedProductModel> {
  const response = await authenticatedAdminFetch(
    `/api/admin/models/${encodeURIComponent(slug)}/publish`,
    { method: "POST" },
  );
  const body =
    (await response.json()) as Partial<PublishManagedProductModelResponse>;
  if (!response.ok || !body.model) {
    throw new Error("The Accounting AI version could not be published.");
  }
  return body.model;
}
