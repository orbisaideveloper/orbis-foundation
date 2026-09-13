export interface FoundationPublicAccount {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: string;
  identityLinkStatus: string;
  orbisIdentityId: string | null;
  orbisDisplayId: string | null;
  orbisLifecycle: string | null;
  identityLinkReason: string | null;
}

export interface FoundationPublicOrganization {
  id: string;
  name: string;
  tdsRateBps: number;
  userLedgerStorage: string;
  status: string;
}

export interface FoundationPublishedModel {
  slug: string;
  displayName: string;
  category: string;
  status: string;
  publishedVersion: {
    sequence: number;
    lifecycle: "PUBLISHED";
    definition: Record<string, unknown>;
    publishedAt: string | null;
  };
}

export interface PublicAccountProfileInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneCountryCallingCode?: string | null;
}

export interface EnsureAccountResult {
  account: FoundationPublicAccount;
  organization: FoundationPublicOrganization | null;
}

export class PublicAccountingApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = "PublicAccountingApiError";
    this.status = status;
    this.code = code;
  }
}

const API_ROOT = "/api/accounting/lottery";

async function requestJson<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { code?: string };
  };

  if (!response.ok) {
    throw new PublicAccountingApiError(
      response.status,
      payload.error?.code || "PUBLIC_ACCOUNTING_REQUEST_FAILED",
    );
  }

  return payload as T;
}

export async function getPublicAccount(
  accessToken: string,
): Promise<FoundationPublicAccount | null> {
  try {
    const result = await requestJson<{ account: FoundationPublicAccount }>(
      accessToken,
      "/account",
    );
    return result.account;
  } catch (error) {
    if (
      error instanceof PublicAccountingApiError &&
      error.status === 404 &&
      error.code === "FOUNDATION_ACCOUNT_NOT_FOUND"
    ) {
      return null;
    }
    throw error;
  }
}

export async function ensurePublicAccount(
  accessToken: string,
  profile: PublicAccountProfileInput,
): Promise<EnsureAccountResult> {
  return requestJson<EnsureAccountResult>(accessToken, "/account", {
    method: "POST",
    body: JSON.stringify(profile),
  });
}

export async function getPublishedAccountingModel(
  accessToken: string,
): Promise<FoundationPublishedModel | null> {
  try {
    const result = await requestJson<{ model: FoundationPublishedModel }>(
      accessToken,
      "/model",
    );
    return result.model;
  } catch (error) {
    if (
      error instanceof PublicAccountingApiError &&
      error.status === 404 &&
      error.code === "ACCOUNTING_MODEL_NOT_PUBLISHED"
    ) {
      return null;
    }
    throw error;
  }
}

export async function getPublicOrganizations(
  accessToken: string,
): Promise<FoundationPublicOrganization[]> {
  const result = await requestJson<{
    organizations: FoundationPublicOrganization[];
  }>(accessToken, "/organizations");
  return result.organizations;
}
