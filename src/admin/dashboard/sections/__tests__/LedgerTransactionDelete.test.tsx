import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LedgerTransactionDelete } from "../LedgerTransactionDelete";
import type { LotteryAccountingClient } from "../../../models/lotteryAccountingClient";

const FINAL_DELETE_LABEL = "Yes, delete permanently from live books";
const REFRESH_LEDGER_LABEL = "Refresh ledger";

const preview = { organizationId: "org", entityType: "PAYMENT" as const, entityId: "payment",
  reference: "PAY-1", previewToken: "reviewed-token",
  effects: { transactions: 2, payments: 1, settlements: 1, ledgerLines: 2, stockAdjustments: 0 } };
function client() {
  return { previewAccountingVoid: vi.fn().mockResolvedValue(preview),
    voidAccountingTransaction: vi.fn().mockResolvedValue({ ...preview, voided: true }) } as unknown as LotteryAccountingClient;
}
function show(api: LotteryAccountingClient, options: Partial<React.ComponentProps<typeof LedgerTransactionDelete>> = {}) {
  const onRefresh = vi.fn().mockResolvedValue(true); const onBack = vi.fn();
  render(<LedgerTransactionDelete api={api} organizationId="org" entityType="PAYMENT" entityId="payment"
    reference="PAY-1" localOnly={false} onRefresh={onRefresh} onBack={onBack} {...options} />);
  return { onRefresh, onBack };
}
async function firstConfirmation() {
  fireEvent.click(screen.getByRole("button", { name: "Delete transaction" }));
  const button = await screen.findByRole("button", { name: "Yes, continue" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

describe("Transaction deletion confirmations", () => {
  it("does not mutate before both confirmations and supports cancellation", async () => {
    const api = client(); const { onRefresh, onBack } = show(api);
    fireEvent.click(screen.getByRole("button", { name: "Delete transaction" }));
    await screen.findByRole("alertdialog");
    expect(api.voidAccountingTransaction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await firstConfirmation();
    expect(api.voidAccountingTransaction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: FINAL_DELETE_LABEL }));
    await waitFor(() => expect(onBack).toHaveBeenCalledOnce());
    expect(api.voidAccountingTransaction).toHaveBeenCalledWith("PAYMENT", "payment", expect.objectContaining({
      organizationId: "org", previewToken: "reviewed-token", operationId: expect.any(String),
    }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });
  it("shows a conflict without pretending a deletion or refresh succeeded", async () => {
    const api = client(); vi.mocked(api.voidAccountingTransaction as NonNullable<LotteryAccountingClient["voidAccountingTransaction"]>).mockRejectedValue(new Error("VOID CONFLICT"));
    const { onRefresh, onBack } = show(api); await firstConfirmation();
    fireEvent.click(screen.getByRole("button", { name: FINAL_DELETE_LABEL }));
    expect(await screen.findByRole("alert")).toHaveTextContent("VOID CONFLICT");
    expect(onRefresh).not.toHaveBeenCalled(); expect(onBack).not.toHaveBeenCalled();
  });
  it("requires both confirmations for device deletion and never invokes cloud mutation", async () => {
    const api = client(); const onDeleteLocal = vi.fn().mockResolvedValue(undefined);
    show(api, { localOnly: true, onDeleteLocal }); await firstConfirmation();
    expect(onDeleteLocal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: FINAL_DELETE_LABEL }));
    await waitFor(() => expect(onDeleteLocal).toHaveBeenCalledOnce());
    expect(api.previewAccountingVoid).not.toHaveBeenCalled(); expect(api.voidAccountingTransaction).not.toHaveBeenCalled();
  });
  it("retains a saved deletion when the refresh fails, then retries only the read", async () => {
    const api = client(); const onRefresh = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const onBack = vi.fn(); show(api, { onRefresh, onBack }); await firstConfirmation();
    fireEvent.click(screen.getByRole("button", { name: FINAL_DELETE_LABEL }));
    await screen.findByRole("button", { name: REFRESH_LEDGER_LABEL });
    await waitFor(() => expect(screen.getByRole("button", { name: REFRESH_LEDGER_LABEL })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: REFRESH_LEDGER_LABEL }));
    await waitFor(() => expect(onBack).toHaveBeenCalledOnce());
    expect(api.voidAccountingTransaction).toHaveBeenCalledOnce();
  });
});
