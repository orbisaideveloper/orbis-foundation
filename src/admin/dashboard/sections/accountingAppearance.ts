export const ACCOUNTING_APPEARANCES = [
  {
    value: "CLASSIC",
    label: "Classic / Existing",
    description: "Keep the existing Accounting workspace presentation.",
  },
  {
    value: "SIGNATURE_LIGHT",
    label: "Signature Emerald",
    description: "Premium emerald, teal, white and soft-gold public design.",
  },
  {
    value: "SIGNATURE_DARK",
    label: "Signature Emerald Dark",
    description: "The Signature Emerald public design in a dark appearance.",
  },
] as const;

export type AccountingAppearance =
  (typeof ACCOUNTING_APPEARANCES)[number]["value"];

export const ACCOUNTING_APPEARANCE_STORAGE_KEY =
  "orbis-accounting-public-appearance";

export const DEFAULT_ACCOUNTING_APPEARANCE: AccountingAppearance =
  "SIGNATURE_LIGHT";

export function isAccountingAppearance(
  value: string | null | undefined,
): value is AccountingAppearance {
  return ACCOUNTING_APPEARANCES.some((item) => item.value === value);
}

export function readAccountingAppearance(
  storage?: Pick<Storage, "getItem">,
): AccountingAppearance {
  const source =
    storage ??
    (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!source) return DEFAULT_ACCOUNTING_APPEARANCE;
  const stored = source.getItem(ACCOUNTING_APPEARANCE_STORAGE_KEY);
  return isAccountingAppearance(stored)
    ? stored
    : DEFAULT_ACCOUNTING_APPEARANCE;
}

export function writeAccountingAppearance(
  appearance: AccountingAppearance,
  storage?: Pick<Storage, "setItem">,
): void {
  const target =
    storage ??
    (typeof window !== "undefined" ? window.localStorage : undefined);
  target?.setItem(ACCOUNTING_APPEARANCE_STORAGE_KEY, appearance);
}
