import { authenticatedAdminFetch } from "../auth/adminFetch";
import type {
  LotteryOrganization,
  LotterySalePreview,
  LotteryWorkspace,
} from "./lotteryAccountingTypes";

const LOTTERY_ADMIN_BASE =
  "/api/admin/models/orbis-accounting-ai/modules/lottery";

async function readLotteryResponse<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await authenticatedAdminFetch(
    `${LOTTERY_ADMIN_BASE}${path}`,
    { ...init, headers },
  );
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("Lottery Accounting returned an invalid response.");
  }
  if (!response.ok) {
    const code =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "object" &&
      body.error !== null &&
      "code" in body.error &&
      typeof body.error.code === "string"
        ? body.error.code
        : "LOTTERY_ACCOUNTING_UNAVAILABLE";
    throw new Error(code.replace(/_/g, " "));
  }
  return body as T;
}

function postLottery<T>(path: string, payload: unknown): Promise<T> {
  return readLotteryResponse<T>(path, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function patchLottery<T>(path: string, payload: unknown): Promise<T> {
  return readLotteryResponse<T>(path, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

function deleteLottery<T>(path: string, payload: unknown): Promise<T> {
  return readLotteryResponse<T>(path, {
    method: "DELETE",
    body: JSON.stringify(payload),
  });
}

export interface LotteryAccountingClient {
  listOrganizations: () => Promise<LotteryOrganization[]>;
  loadWorkspace: (organizationId: string) => Promise<LotteryWorkspace>;
  createOrganization: (payload: {
    name: string;
  }) => Promise<LotteryOrganization>;
  createParty: (payload: Record<string, unknown>) => Promise<void>;
  updatePartyProfile: (payload: Record<string, unknown>) => Promise<void>;
  updateOrganizationTdsRate: (payload: {
    organizationId: string;
    tdsRateBps: number;
  }) => Promise<void>;
  updateUserLedgerStorage: (payload: {
    organizationId: string;
    userLedgerStorage: "CLOUD" | "DEVICE";
  }) => Promise<void>;
  createPeriod: (payload: Record<string, unknown>) => Promise<void>;
  createFinancialYearPeriod: (
    payload: Record<string, unknown>,
  ) => Promise<void>;
  recordStockMovement: (payload: Record<string, unknown>) => Promise<void>;
  previewSale: (
    payload: Record<string, unknown>,
  ) => Promise<LotterySalePreview>;
  recordSale: (payload: Record<string, unknown>) => Promise<void>;
  saveDailySellerDraft: (payload: Record<string, unknown>) => Promise<void>;
  updateDailySellerDraft: (
    saleId: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  deleteDailySellerDraft: (
    saleId: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  postDailySellerDraft: (
    saleId: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  correctPostedSale: (
    saleId: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  recordPayment: (payload: Record<string, unknown>) => Promise<void>;
  recordSettlement: (payload: Record<string, unknown>) => Promise<void>;
}

export const lotteryAccountingClient: LotteryAccountingClient = {
  async listOrganizations() {
    const body = await readLotteryResponse<{
      organizations: LotteryOrganization[];
    }>("/organizations");
    return body.organizations;
  },
  async loadWorkspace(organizationId) {
    const body = await readLotteryResponse<{ workspace: LotteryWorkspace }>(
      `/workspace?organizationId=${encodeURIComponent(organizationId)}`,
    );
    return body.workspace;
  },
  async createOrganization(payload) {
    const body = await postLottery<{ organization: LotteryOrganization }>(
      "/organizations",
      payload,
    );
    return body.organization;
  },
  async createParty(payload) {
    await postLottery("/parties", payload);
  },
  async updatePartyProfile(payload) {
    const partyId = String(payload.partyId || "");
    await patchLottery(
      `/parties/${encodeURIComponent(partyId)}/profile`,
      payload,
    );
  },
  async updateOrganizationTdsRate(payload) {
    await patchLottery("/settings/tds-rate", payload);
  },
  async updateUserLedgerStorage(payload) {
    await patchLottery("/settings/user-ledger-storage", payload);
  },
  async createPeriod(payload) {
    await postLottery("/periods", payload);
  },
  async createFinancialYearPeriod(payload) {
    await postLottery("/periods/financial-year", payload);
  },
  async recordStockMovement(payload) {
    await postLottery("/stock-movements", payload);
  },
  async previewSale(payload) {
    return postLottery<LotterySalePreview>("/sales/preview", payload);
  },
  async recordSale(payload) {
    await postLottery("/sales", payload);
  },
  async saveDailySellerDraft(payload) {
    await postLottery("/daily-seller-drafts", payload);
  },
  async updateDailySellerDraft(saleId, payload) {
    await patchLottery(
      `/daily-seller-drafts/${encodeURIComponent(saleId)}`,
      payload,
    );
  },
  async deleteDailySellerDraft(saleId, payload) {
    await deleteLottery(
      `/daily-seller-drafts/${encodeURIComponent(saleId)}`,
      payload,
    );
  },
  async postDailySellerDraft(saleId, payload) {
    await postLottery(
      `/daily-seller-drafts/${encodeURIComponent(saleId)}/post`,
      payload,
    );
  },
  async correctPostedSale(saleId, payload) {
    await postLottery(`/sales/${encodeURIComponent(saleId)}/correct`, payload);
  },
  async recordPayment(payload) {
    await postLottery("/payments", payload);
  },
  async recordSettlement(payload) {
    await postLottery("/settlements", payload);
  },
};
