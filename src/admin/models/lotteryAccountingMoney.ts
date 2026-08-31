function decimalParts(value: string): [string, string] | null {
  const match = value.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  return [match[1], (match[2] || "").padEnd(2, "0")];
}

export function rupeesToPaise(value: string): string | null {
  const parts = decimalParts(value);
  if (!parts) return null;
  return (BigInt(parts[0]) * 100n + BigInt(parts[1])).toString();
}

export function percentToBasisPoints(value: string): string | null {
  const parts = decimalParts(value);
  if (!parts) return null;
  const basisPoints = BigInt(parts[0]) * 100n + BigInt(parts[1]);
  return basisPoints <= 10_000n ? basisPoints.toString() : null;
}

export function formatPaise(value: string | number | bigint): string {
  const paise = BigInt(value);
  const negative = paise < 0n;
  const absolute = negative ? -paise : paise;
  const rupees = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}₹${rupees.toLocaleString("en-IN")}.${fraction}`;
}

export function formatPercentFromBasisPoints(value: number | string): string {
  const basisPoints = BigInt(value);
  const whole = basisPoints / 100n;
  const fraction = (basisPoints % 100n).toString().padStart(2, "0");
  return `${whole}.${fraction}%`;
}

export function sumPaise(values: Iterable<string | number | bigint>): string {
  let total = 0n;
  for (const value of values) total += BigInt(value);
  return total.toString();
}
