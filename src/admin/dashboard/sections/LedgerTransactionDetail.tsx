import React, { useEffect, useMemo, useState } from "react";
import type {
  LotteryAccountingClient,
  LotteryAccountingCorrectionAck,
  LotteryAccountingCorrectionEntityType,
} from "../../models/lotteryAccountingClient";
import {
  formatPaise,
  rupeesToPaise,
} from "../../models/lotteryAccountingMoney";
import type { LotteryWorkspace } from "../../models/lotteryAccountingTypes";

export type LedgerTransactionContext = Readonly<{
  id: string;
  occurredAt: string;
  business: string;
  money: string;
  balance: string;
  detail: string;
  book: Readonly<{
    id: string;
    category: string;
    subtype: string;
    name: string;
    typeLabel: string;
  }>;
}>;

type CorrectionKind =
  | "SELLER_SALE"
  | "STOCKIST_ENTRY"
  | "CUSTOMER_BILL"
  | "EXPENSE_BILL"
  | "EXPENSE_PAYMENT"
  | "PAYMENT";

type Source = Readonly<{
  kind: CorrectionKind | "READ_ONLY";
  id: string;
  label: string;
  row: Record<string, unknown>;
}>;

function isAccountingCorrectionEntityType(
  kind: Source["kind"],
): kind is LotteryAccountingCorrectionEntityType {
  return kind !== "SELLER_SALE" && kind !== "READ_ONLY";
}

type EditableField = Readonly<{
  key: string;
  label: string;
  mode: "INTEGER" | "MONEY";
}>;

const CONTROL =
  "w-full rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-xs text-slate-800 outline-none placeholder:text-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
const PRIMARY =
  "rounded-xl border border-emerald-200 bg-emerald-700 px-3 py-2 text-[10px] font-black text-white disabled:opacity-50";
const SECONDARY =
  "rounded-xl border border-emerald-100 bg-white px-3 py-2 text-[10px] font-bold text-slate-600";

const CORRECTION_FIELDS: Record<
  Exclude<CorrectionKind, "SELLER_SALE">,
  EditableField[]
> = {
  STOCKIST_ENTRY: [
    { key: "purchaseQuantity", label: "Purchase quantity", mode: "INTEGER" },
    { key: "morningReturnQuantity", label: "Morning return", mode: "INTEGER" },
    { key: "dayReturnQuantity", label: "Day return", mode: "INTEGER" },
    { key: "eveningReturnQuantity", label: "Evening return", mode: "INTEGER" },
    { key: "commissionPaise", label: "Commission", mode: "MONEY" },
  ],
  CUSTOMER_BILL: [
    { key: "quantity", label: "Quantity", mode: "INTEGER" },
    { key: "unitRatePaise", label: "Unit rate", mode: "MONEY" },
  ],
  EXPENSE_BILL: [
    { key: "amountPaise", label: "Amount", mode: "MONEY" },
  ],
  EXPENSE_PAYMENT: [
    { key: "totalAmountPaise", label: "Total", mode: "MONEY" },
    { key: "cashPaise", label: "Cash", mode: "MONEY" },
    { key: "bankPaise", label: "Bank", mode: "MONEY" },
  ],
  PAYMENT: [
    { key: "totalAmountPaise", label: "Total", mode: "MONEY" },
    { key: "cashPaise", label: "Cash", mode: "MONEY" },
    { key: "bankPaise", label: "Bank", mode: "MONEY" },
    { key: "upiPaise", label: "UPI", mode: "MONEY" },
    { key: "chequePaise", label: "Cheque", mode: "MONEY" },
    { key: "pwtPaise", label: "PWT", mode: "MONEY" },
  ],
};

function rawId(transactionId: string, prefix: string) {
  return transactionId.startsWith(prefix)
    ? transactionId.slice(prefix.length)
    : transactionId;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function correctedVersion(row: Record<string, unknown>) {
  const value = Number(row.correctionVersion || 0);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function findSale(workspace: LotteryWorkspace, id: string) {
  return [...workspace.sales, ...workspace.draftSales].find(
    (item) => item.id === id,
  );
}

function sellerSaleSource(
  workspace: LotteryWorkspace,
  id: string,
): Source | null {
  const row = findSale(workspace, id);
  if (!row) return null;
  return {
    kind: "SELLER_SALE",
    id: row.id,
    label: "Seller sale",
    row: row as unknown as Record<string, unknown>,
  };
}

function stockistEntrySource(
  workspace: LotteryWorkspace,
  id: string,
): Source | null {
  const row = workspace.stockistEntries.find((item) => item.id === id);
  if (!row) return null;
  return {
    kind: row.source === "DAILY" ? "STOCKIST_ENTRY" : "READ_ONLY",
    id: row.id,
    label:
      row.source === "DAILY" ? "Stockist entry" : "Legacy stockist entry",
    row: row as unknown as Record<string, unknown>,
  };
}

function customerBillSource(
  workspace: LotteryWorkspace,
  id: string,
): Source | null {
  const row = workspace.customerBills.find((item) => item.id === id);
  if (!row) return null;
  return {
    kind: "CUSTOMER_BILL",
    id: row.id,
    label: "Customer bill",
    row: row as unknown as Record<string, unknown>,
  };
}

function expenseBillSource(
  workspace: LotteryWorkspace,
  id: string,
): Source | null {
  const row = workspace.expenseBills.find((item) => item.id === id);
  if (!row) return null;
  return {
    kind: "EXPENSE_BILL",
    id: row.id,
    label: "Expense bill",
    row: row as unknown as Record<string, unknown>,
  };
}

function expensePaymentSource(
  workspace: LotteryWorkspace,
  id: string,
): Source | null {
  const row = workspace.expensePayments.find((item) => item.id === id);
  if (!row) return null;
  return {
    kind: "EXPENSE_PAYMENT",
    id: row.id,
    label: "Expense payment",
    row: row as unknown as Record<string, unknown>,
  };
}

function paymentSource(
  workspace: LotteryWorkspace,
  id: string,
): Source | null {
  const row = workspace.payments.find((item) => item.id === id);
  if (!row) return null;
  return {
    kind: "PAYMENT",
    id: row.id,
    label: row.direction === "RECEIPT" ? "Receipt" : "Payment",
    row: row as unknown as Record<string, unknown>,
  };
}

function paymentLikeSourceId(id: string) {
  if (id.startsWith("payment-")) return rawId(id, "payment-");
  if (id.startsWith("pay-")) return rawId(id, "pay-");
  return rawId(id, "expense-");
}

function isPaymentLikeId(id: string) {
  return (
    id.startsWith("payment-") ||
    id.startsWith("pay-") ||
    id.startsWith("expense-")
  );
}

function prefixedSource(
  workspace: LotteryWorkspace,
  context: LedgerTransactionContext,
): Source | null {
  const { id, book } = context;

  if (id.startsWith("sale-")) {
    return sellerSaleSource(workspace, rawId(id, "sale-"));
  }
  if (id.startsWith("purchase-")) {
    return stockistEntrySource(workspace, rawId(id, "purchase-"));
  }
  if (id.startsWith("customer-")) {
    return customerBillSource(workspace, rawId(id, "customer-"));
  }
  if (id.startsWith("bill-")) {
    return expenseBillSource(workspace, rawId(id, "bill-"));
  }
  if (!isPaymentLikeId(id)) return null;

  const sourceId = paymentLikeSourceId(id);
  const expense = expensePaymentSource(workspace, sourceId);

  if (
    expense &&
    (book.category === "expense" || book.subtype === "expense")
  ) {
    return expense;
  }

  return paymentSource(workspace, sourceId);
}

function isSellerDerivedBook(book: LedgerTransactionContext["book"]) {
  return (
    (book.category === "sale" && book.subtype === "seller") ||
    (book.category === "return" && book.subtype === "seller") ||
    ((book.category === "commission" || book.category === "tds") &&
      book.subtype === "seller")
  );
}

function isStockistDerivedBook(book: LedgerTransactionContext["book"]) {
  return (
    book.category === "purchase" ||
    (book.category === "return" && book.subtype === "stockist") ||
    ((book.category === "commission" || book.category === "tds") &&
      book.subtype === "stockist")
  );
}

function derivedSource(
  workspace: LotteryWorkspace,
  context: LedgerTransactionContext,
): Source | null {
  const { id, book } = context;

  if (book.category === "sale" && book.subtype === "customer") {
    return customerBillSource(workspace, id);
  }
  if (isSellerDerivedBook(book)) {
    return sellerSaleSource(workspace, id);
  }
  if (isStockistDerivedBook(book)) {
    return stockistEntrySource(workspace, id);
  }
  if (book.category === "payment" && book.subtype === "expense") {
    return expensePaymentSource(workspace, id);
  }
  if (
    book.category === "payment" ||
    book.category === "money" ||
    book.category === "pwt"
  ) {
    return (
      paymentSource(workspace, id) ||
      expensePaymentSource(workspace, id)
    );
  }

  return null;
}

function readOnlySource(context: LedgerTransactionContext): Source {
  return {
    kind: "READ_ONLY",
    id: context.id,
    label: context.book.typeLabel,
    row: {
      occurredAt: context.occurredAt,
      business: context.business,
      money: context.money,
      balance: context.balance,
      detail: context.detail,
    },
  };
}

function findSource(
  workspace: LotteryWorkspace,
  context: LedgerTransactionContext,
): Source {
  return (
    prefixedSource(workspace, context) ||
    derivedSource(workspace, context) ||
    readOnlySource(context)
  );
}

function operationId() {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `corr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toInput(field: EditableField, value: unknown) {
  if (field.mode === "INTEGER") return String(value ?? "0");
  const paise = BigInt(String(value ?? "0"));
  return `${paise / 100n}.${(paise % 100n).toString().padStart(2, "0")}`;
}

function initialValues(source: Source) {
  if (source.kind === "SELLER_SALE" || source.kind === "READ_ONLY") return {};
  const fields = CORRECTION_FIELDS[source.kind];
  const split = asRecord(source.row.methodSplit) || {};
  return Object.fromEntries(
    fields.map((field) => [
      field.key,
      toInput(
        field,
        field.key.endsWith("Paise") && field.key in split
          ? split[field.key]
          : source.row[field.key],
      ),
    ]),
  );
}

function replacementFromValues(
  source: Source,
  values: Record<string, string>,
): Record<string, unknown> | null {
  if (source.kind === "SELLER_SALE" || source.kind === "READ_ONLY") return null;
  const fields = CORRECTION_FIELDS[source.kind];
  const parsed = new Map<string, string>();
  for (const field of fields) {
    const value = values[field.key]?.trim() || "";
    if (field.mode === "INTEGER") {
      if (!/^\d+$/.test(value)) return null;
      parsed.set(field.key, value);
    } else {
      const paise = rupeesToPaise(value);
      if (paise === null) return null;
      parsed.set(field.key, paise);
    }
  }

  if (source.kind === "PAYMENT") {
    return {
      totalAmountPaise: parsed.get("totalAmountPaise"),
      methodSplit: {
        cashPaise: parsed.get("cashPaise"),
        bankPaise: parsed.get("bankPaise"),
        upiPaise: parsed.get("upiPaise"),
        chequePaise: parsed.get("chequePaise"),
        pwtPaise: parsed.get("pwtPaise"),
      },
    };
  }
  return Object.fromEntries(parsed);
}

function detailRows(source: Source, context: LedgerTransactionContext) {
  const row = source.row;
  const lines: Array<[string, string]> = [
    ["Type", source.label],
    ["Ledger", context.book.name],
    ["Date", String(row.occurredAt || context.occurredAt)],
  ];
  if (row.reference) lines.push(["Reference", String(row.reference)]);
  if (row.partyName) lines.push(["Party", String(row.partyName)]);
  if (row.profileName) lines.push(["Expense profile", String(row.profileName)]);
  if (row.direction) lines.push(["Direction", String(row.direction)]);
  if (row.quantity !== undefined) lines.push(["Quantity", String(row.quantity)]);
  if (row.purchaseQuantity !== undefined) {
    lines.push(["Purchase", String(row.purchaseQuantity)]);
  }
  if (row.totalReturnQuantity !== undefined) {
    lines.push(["Total return", String(row.totalReturnQuantity)]);
  }
  for (const [key, label] of [
    ["amountPaise", "Amount"],
    ["totalAmountPaise", "Total"],
    ["grossSalesPaise", "Gross sale"],
    ["grossPurchasePaise", "Gross purchase"],
    ["commissionPaise", "Commission"],
    ["tdsPaise", "TDS"],
    ["netPayablePaise", "Net payable"],
  ] as const) {
    if (row[key] !== undefined) lines.push([label, formatPaise(String(row[key]))]);
  }
  lines.push(["Ledger detail", context.detail]);
  lines.push(["Ledger balance / net", context.balance]);
  lines.push(["Correction version", String(correctedVersion(row))]);
  return lines;
}

export function LedgerTransactionDetail({
  workspace,
  organizationId,
  api,
  context,
  onBack,
  onRefresh,
  onSellerCorrection,
}: Readonly<{
  workspace: LotteryWorkspace;
  organizationId: string;
  api: LotteryAccountingClient;
  context: LedgerTransactionContext;
  onBack: () => void;
  onRefresh: () => Promise<boolean>;
  onSellerCorrection: (partyId: string, occurredAt: string) => void;
}>) {
  const source = useMemo(() => findSource(workspace, context), [context, workspace]);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() =>
    initialValues(source),
  );
  const [reason, setReason] = useState("");
  const [currentOperationId, setCurrentOperationId] = useState(operationId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEditing(false);
    setValues(initialValues(source));
    setReason("");
    setCurrentOperationId(operationId());
    setMessage(null);
    setError(null);
  }, [source.id, source.kind, correctedVersion(source.row)]);

  const sellerCorrection = async () => {
    const partyId = String(source.row.partyId || "");
    const occurredAt = String(source.row.occurredAt || context.occurredAt);
    if (!partyId || !source.id) return;
    setBusy(true);
    setError(null);
    try {
      await api.correctPostedSale(source.id, { organizationId });
      await onRefresh();
      onSellerCorrection(partyId, occurredAt);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Seller correction could not be opened.",
      );
    } finally {
      setBusy(false);
    }
  };

  const saveCorrection = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const replacement = replacementFromValues(source, values);
    if (!replacement) {
      setError("Enter valid whole-number quantities and valid rupee amounts.");
      return;
    }
    if (!api.correctAccountingTransaction) {
      setError("Safe correction API is not available in this build.");
      return;
    }
    if (!isAccountingCorrectionEntityType(source.kind)) {
      setError("This transaction uses a separate correction flow.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const acknowledgement: LotteryAccountingCorrectionAck =
        await api.correctAccountingTransaction(source.kind, source.id, {
          organizationId,
          expectedVersion: correctedVersion(source.row),
          operationId: currentOperationId,
          replacement,
          reason: reason.trim() || undefined,
        });
      await onRefresh();
      setEditing(false);
      setMessage(`Correction saved · version ${acknowledgement.version}`);
      setCurrentOperationId(operationId());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Correction could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };

  const fields =
    source.kind === "SELLER_SALE" || source.kind === "READ_ONLY"
      ? []
      : CORRECTION_FIELDS[source.kind];

  return (
    <section
      aria-label="Transaction detail"
      className="rounded-[22px] border border-emerald-100 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[8px] font-black uppercase tracking-[0.08em] text-emerald-700">
            Transaction detail
          </p>
          <h4 className="mt-1 text-sm font-black text-slate-950">{source.label}</h4>
        </div>
        <button type="button" onClick={onBack} className={SECONDARY}>
          Back
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {detailRows(source, context).map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-100 p-2.5">
            <p className="text-[7px] font-black uppercase tracking-[0.08em] text-slate-400">
              {label}
            </p>
            <p className="mt-1 break-words text-[10px] font-bold text-slate-800">
              {value}
            </p>
          </div>
        ))}
      </div>

      {message && (
        <p className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-2 text-[9px] font-bold text-emerald-800">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-xl border border-orange-100 bg-orange-50 p-2 text-[9px] font-bold text-orange-800">
          {error}
        </p>
      )}

      {source.kind === "SELLER_SALE" && source.row.status === "POSTED" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void sellerCorrection()}
          className={`${PRIMARY} mt-3`}
        >
          Correct seller sale safely
        </button>
      )}

      {source.kind !== "SELLER_SALE" &&
        source.kind !== "READ_ONLY" &&
        !editing && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(true)}
            className={`${PRIMARY} mt-3`}
          >
            Correct safely
          </button>
        )}

      {editing && (
        <form onSubmit={saveCorrection} className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {fields.map((field) => (
              <label key={field.key}>
                <span className="text-[8px] font-bold text-slate-500">
                  {field.label}
                </span>
                <input
                  aria-label={`Correction ${field.label}`}
                  inputMode={field.mode === "INTEGER" ? "numeric" : "decimal"}
                  value={values[field.key] || ""}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                  className={CONTROL}
                />
              </label>
            ))}
          </div>

          <label>
            <span className="text-[8px] font-bold text-slate-500">
              Correction reason
            </span>
            <input
              aria-label="Correction reason"
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              className={CONTROL}
              placeholder="Optional audit note"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className={PRIMARY}>
              {busy ? "Saving…" : "Save correction"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setValues(initialValues(source));
                setReason("");
                setCurrentOperationId(operationId());
                setError(null);
              }}
              className={SECONDARY}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
