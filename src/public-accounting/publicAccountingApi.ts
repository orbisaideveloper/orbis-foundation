import type {
  LotteryAccountingClient,
  LotteryAccountingCorrectionAck,
  LotteryAccountingReadClient,
  LotteryRecordedPayment,
} from "../admin/models/lotteryAccountingClient";
import type {
  LotteryDailySellerDraftIdentity,
  LotteryDailyStockistEntryIdentity,
  LotteryOrganization,
  LotterySalePreview,
  LotteryWorkspace,
} from "../admin/models/lotteryAccountingTypes";

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
  userLedgerStorage: "CLOUD" | "DEVICE";
  status: string;
  createdAt: string;
  updatedAt: string;
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
  readonly currentVersion?: number;

  constructor(status: number, code: string, currentVersion?: number) {
    super(code);
    this.name = "PublicAccountingApiError";
    this.status = status;
    this.code = code;
    this.currentVersion = currentVersion;
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
    error?: { code?: string; currentVersion?: number };
  };

  if (!response.ok) {
    throw new PublicAccountingApiError(
      response.status,
      payload.error?.code || "PUBLIC_ACCOUNTING_REQUEST_FAILED",
      Number.isSafeInteger(payload.error?.currentVersion)
        ? payload.error?.currentVersion
        : undefined,
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


export function createPublicLotteryAccountingReadClient(
  accessToken: string,
): LotteryAccountingReadClient {
  return {
    listOrganizations: () => getPublicOrganizations(accessToken),
    async loadWorkspace(organizationId: string) {
      const result = await requestJson<{ workspace: LotteryWorkspace }>(
        accessToken,
        `/workspace?organizationId=${encodeURIComponent(organizationId)}`,
      );
      return result.workspace;
    },
  };
}

function postPublic<T>(
  accessToken: string,
  path: string,
  payload: unknown,
): Promise<T> {
  return requestJson<T>(accessToken, path, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function patchPublic<T>(
  accessToken: string,
  path: string,
  payload: unknown,
): Promise<T> {
  return requestJson<T>(accessToken, path, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

function deletePublic<T>(
  accessToken: string,
  path: string,
  payload: unknown,
): Promise<T> {
  return requestJson<T>(accessToken, path, {
    method: "DELETE",
    body: JSON.stringify(payload),
  });
}

export function createPublicLotteryAccountingClient(
  accessToken: string,
): LotteryAccountingClient {
  const readClient = createPublicLotteryAccountingReadClient(accessToken);

  return {
    listOrganizations: readClient.listOrganizations,
    loadWorkspace: readClient.loadWorkspace,
    async createOrganization(payload) {
      const body = await postPublic<{ organization: LotteryOrganization }>(
        accessToken,
        "/organizations",
        payload,
      );
      return body.organization;
    },
    async createParty(payload) {
      await postPublic(accessToken, "/parties", payload);
    },
    async updatePartyProfile(payload) {
      const partyId = String(payload.partyId || "");
      await patchPublic(
        accessToken,
        `/parties/${encodeURIComponent(partyId)}/profile`,
        payload,
      );
    },
    async updateOrganizationTdsRate(payload) {
      await patchPublic(accessToken, "/settings/tds-rate", payload);
    },
    async updateUserLedgerStorage(payload) {
      await patchPublic(accessToken, "/settings/user-ledger-storage", payload);
    },
    async createPeriod(payload) {
      await postPublic(accessToken, "/periods", payload);
    },
    async createFinancialYearPeriod(payload) {
      await postPublic(accessToken, "/periods/financial-year", payload);
    },
    async recordStockMovement(payload) {
      await postPublic(accessToken, "/stock-movements", payload);
    },
    async saveDailyStockistEntry(payload) {
      const body = await postPublic<{
        entry: LotteryDailyStockistEntryIdentity;
      }>(accessToken, "/daily-stockist-entries", payload);
      return body.entry;
    },
    async clearDailyEntries(payload) {
      await postPublic(accessToken, "/daily-entry-clearances", payload);
    },
    async previewSale(payload) {
      return postPublic<LotterySalePreview>(
        accessToken,
        "/sales/preview",
        payload,
      );
    },
    async recordSale(payload) {
      await postPublic(accessToken, "/sales", payload);
    },
    async saveDailySellerDraft(payload) {
      const body = await postPublic<{ sale: LotteryDailySellerDraftIdentity }>(
        accessToken,
        "/daily-seller-drafts",
        payload,
      );
      return body.sale;
    },
    async updateDailySellerDraft(saleId, payload) {
      const body = await patchPublic<{
        sale: LotteryDailySellerDraftIdentity;
      }>(
        accessToken,
        `/daily-seller-drafts/${encodeURIComponent(saleId)}`,
        payload,
      );
      return body.sale;
    },
    async deleteDailySellerDraft(saleId, payload) {
      await deletePublic(
        accessToken,
        `/daily-seller-drafts/${encodeURIComponent(saleId)}`,
        payload,
      );
    },
    async postDailySellerDraft(saleId, payload) {
      await postPublic(
        accessToken,
        `/daily-seller-drafts/${encodeURIComponent(saleId)}/post`,
        payload,
      );
    },
    async correctPostedSale(saleId, payload) {
      const body = await postPublic<{
        draft: LotteryDailySellerDraftIdentity;
      }>(
        accessToken,
        `/sales/${encodeURIComponent(saleId)}/correct`,
        payload,
      );
      return body.draft;
    },
    async correctAccountingTransaction(entityType, entityId, payload) {
      const body = await postPublic<{
        correction: LotteryAccountingCorrectionAck;
      }>(
        accessToken,
        `/corrections/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
        payload,
      );
      return body.correction;
    },
    async recordPayment(payload) {
      const body = await postPublic<{ payment: LotteryRecordedPayment }>(
        accessToken,
        "/payments",
        payload,
      );
      return body.payment;
    },
    async createExpenseCategory(payload) {
      await postPublic(accessToken, "/expenses/categories", payload);
    },
    async updateExpenseCategory(categoryId, payload) {
      await patchPublic(
        accessToken,
        `/expenses/categories/${encodeURIComponent(categoryId)}`,
        payload,
      );
    },
    async createExpenseProfile(payload) {
      await postPublic(accessToken, "/expenses/profiles", payload);
    },
    async updateExpenseProfile(profileId, payload) {
      await patchPublic(
        accessToken,
        `/expenses/profiles/${encodeURIComponent(profileId)}`,
        payload,
      );
    },
    async recordExpenseBill(payload) {
      await postPublic(accessToken, "/expenses/bills", payload);
    },
    async recordExpensePayment(payload) {
      await postPublic(accessToken, "/expenses/payments", payload);
    },
    async recordCustomerBill(payload) {
      await postPublic(accessToken, "/customer-bills", payload);
    },
    async recordSettlement(payload) {
      await postPublic(accessToken, "/settlements", payload);
    },
  };
}
