import React, { useState } from "react";
import type { LotteryAccountingClient, LotteryAccountingVoidEntityType, LotteryAccountingVoidPreview } from "../../models/lotteryAccountingClient";

const BUTTON = "rounded-xl border px-3 py-2 text-[10px] font-bold disabled:opacity-50";
const newOperation = () => globalThis.crypto?.randomUUID?.() || `void-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function LedgerTransactionDelete({ api, organizationId, entityType, entityId, reference,
  localOnly, onDeleteLocal, onRefresh, onBack }: Readonly<{
  api: LotteryAccountingClient; organizationId: string; entityType: LotteryAccountingVoidEntityType | null;
  entityId: string; reference: string; localOnly: boolean; onDeleteLocal?: () => Promise<void>;
  onRefresh: () => Promise<boolean>; onBack: () => void;
}>) {
  const [preview, setPreview] = useState<LotteryAccountingVoidPreview | null>(null);
  const [stage, setStage] = useState<1 | 2>(1);
  const [operationId, setOperationId] = useState(newOperation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState(false);
  const available = entityType && (localOnly ? onDeleteLocal : api.previewAccountingVoid && api.voidAccountingTransaction);

  const openPreview = async () => {
    if (!entityType) return;
    setBusy(true); setError(null);
    try {
      if (localOnly) {
        setPreview({ organizationId, entityType, entityId, reference, previewToken: "DEVICE",
          effects: { transactions: 1, ledgerLines: 0, payments: 0, settlements: 0, stockAdjustments: 0 } });
      } else if (api.previewAccountingVoid) {
        setPreview(await api.previewAccountingVoid(entityType, entityId, { organizationId }));
      }
      setStage(1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Deletion preview could not be loaded."); }
    finally { setBusy(false); }
  };
  const refreshLedger = async () => {
    try {
      if (await onRefresh()) onBack();
      else setError("Deletion saved. Refresh the ledger to load the updated balances.");
    } catch { setError("Deletion saved. Refresh the ledger to load the updated balances."); }
  };
  const deleteConfirmed = async () => {
    if (!preview || stage !== 2 || committed) return;
    setBusy(true); setError(null);
    try {
      if (localOnly) {
        if (!onDeleteLocal) throw new Error("Durable device deletion is unavailable.");
        await onDeleteLocal();
      } else {
        if (!api.voidAccountingTransaction) throw new Error("Deletion API is unavailable.");
        await api.voidAccountingTransaction(preview.entityType, preview.entityId,
          { organizationId, operationId, previewToken: preview.previewToken });
      }
      setCommitted(true); setPreview(null);
      await refreshLedger();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Deletion could not be saved. Review again after a conflict."); }
    finally { setBusy(false); }
  };
  if (!entityType) return null;
  return <div className="mt-3">
    {!committed && <button type="button" className={`${BUTTON} border-red-200 text-red-700`}
      disabled={busy || !available} onClick={() => void openPreview()}>Delete transaction</button>}
    {error && <p role="alert" className="mt-2 text-xs text-orange-800">{error}</p>}
    {committed && <button type="button" className={BUTTON} disabled={busy}
      onClick={() => void refreshLedger()}>Refresh ledger</button>}
    {preview && <div role="alertdialog" aria-label="Confirm transaction deletion" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
      <p className="text-xs font-bold">{stage === 1 ? "Delete this transaction?" : "Final confirmation: delete this transaction?"}</p>
      <p className="mt-2 text-xs">{preview.reference || reference}</p>
      <p className="mt-2 text-xs">{preview.effects.transactions} transaction(s), {preview.effects.payments} payment(s), {preview.effects.settlements} settlement(s).</p>
      <p className="mt-2 text-xs">{localOnly ? "This device entry and its pending sync will be removed." : "Linked effects will be reversed together. Original records remain in the audit trail."}</p>
      <div className="mt-3 flex gap-2">
        <button type="button" className={BUTTON} disabled={busy} onClick={() => { setPreview(null); setStage(1); setOperationId(newOperation()); }}>Cancel</button>
        {stage === 1 ? <button type="button" className={BUTTON} disabled={busy} onClick={() => setStage(2)}>Yes, continue</button>
          : <button type="button" className={`${BUTTON} border-red-300 text-red-800`} disabled={busy} onClick={() => void deleteConfirmed()}>Yes, delete permanently from live books</button>}
      </div>
    </div>}
  </div>;
}
