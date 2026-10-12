import { useCallback, useRef, useState, type SetStateAction } from "react";

const PREFIX = "orbis.navigation.v1:";

export function navigationKey(...parts: string[]): string {
  const path = typeof window === "undefined" ? "/" : window.location.pathname;
  return PREFIX + [path, ...parts].map(encodeURIComponent).join(":");
}

export function navigationChoice<T extends string>(choices: readonly T[]) {
  return (value: unknown): value is T =>
    typeof value === "string" && choices.includes(value as T);
}

export function navigationString(value: unknown): value is string {
  return typeof value === "string" && value.length <= 160;
}

export function navigationBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function navigationDateString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value === "") return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
}

export function navigationDate(value: unknown): value is string | null {
  return value === null || (value !== "" && navigationDateString(value));
}

function readNavigation<T>(key: string, initial: T, valid: (value: unknown) => value is T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw || raw.length > 1024) return initial;
    const saved = JSON.parse(raw);
    return saved?.version === 1 && valid(saved.value) ? saved.value : initial;
  } catch {
    return initial;
  }
}

// Persist only validated UI navigation, synchronously when the selection changes.
// Never clear app storage or store financial rows, credentials, or permissions.
export function useNavigationState<T>(
  key: string,
  initial: T,
  valid: (value: unknown) => value is T,
): [T, (action: SetStateAction<T>) => void] {
  const [snapshot, setSnapshot] = useState(() => ({ key, value: readNavigation(key, initial, valid) }));
  const value = snapshot.key === key ? snapshot.value : readNavigation(key, initial, valid);
  const current = useRef(value);
  current.current = value;

  const update = useCallback((action: SetStateAction<T>) => {
    const next = typeof action === "function"
      ? (action as (previous: T) => T)(current.current)
      : action;
    if (!valid(next)) return;
    current.current = next;
    try {
      window.localStorage.setItem(key, JSON.stringify({ version: 1, value: next }));
    } catch {
      // A blocked/full storage area must not interrupt the current workspace.
    }
    setSnapshot({ key, value: next });
  }, [key, valid]);

  return [value, update];
}
