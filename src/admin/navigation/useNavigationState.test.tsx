import React from "react";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { navigationBoolean, navigationChoice, navigationDate, navigationDateString, navigationKey, navigationString, useNavigationState } from "./useNavigationState";

const EXISTING_DATA_KEY = "accounting-existing";
const OWNER = "owner-a";
const VIEW = "view";
const HOME_VIEW = "home";
const LEDGER_VIEW = "ledger";
type View = typeof HOME_VIEW | typeof LEDGER_VIEW;
const valid = navigationChoice([HOME_VIEW, LEDGER_VIEW] as const);
function Probe({ owner }: { owner: string }) {
  const [view, setView] = useNavigationState<View>(navigationKey(owner, VIEW), HOME_VIEW, valid);
  return <button type="button" onClick={() => setView(LEDGER_VIEW)}>{view}</button>;
}

it("restores a tab after remount without changing accounting storage", () => {
  localStorage.setItem(EXISTING_DATA_KEY, "keep-this-data");
  const first = render(<Probe owner={OWNER} />);
  fireEvent.click(screen.getByRole("button", { name: HOME_VIEW }));
  first.unmount();
  render(<Probe owner={OWNER} />);
  expect(screen.getByRole("button", { name: LEDGER_VIEW })).toBeInTheDocument();
  expect(localStorage.getItem(EXISTING_DATA_KEY)).toBe("keep-this-data");
  localStorage.removeItem(EXISTING_DATA_KEY);
});

it("accepts only bounded navigation strings, booleans and supported choices", () => {
  expect(navigationString("")).toBe(true);
  expect(navigationString("a".repeat(160))).toBe(true);
  expect(navigationString("a".repeat(161))).toBe(false);
  expect(navigationString(null)).toBe(false);
  expect(navigationBoolean(true)).toBe(true);
  expect(navigationBoolean(false)).toBe(true);
  expect(navigationBoolean("false")).toBe(false);
  expect(valid(HOME_VIEW)).toBe(true);
  expect(valid(LEDGER_VIEW)).toBe(true);
  expect(valid(1)).toBe(false);
});

it.each([
  ["", true, false],
  ["2024-02-29", true, true],
  ["2025-02-29", false, false],
  ["2026-13-01", false, false],
  ["2026-1-01", false, false],
  ["not-a-date", false, false],
  [null, false, true],
  [42, false, false],
])("rejects rolled-over dates and unsupported date values: %s", (value, plain, nullable) => {
  expect(navigationDateString(value)).toBe(plain);
  expect(navigationDate(value)).toBe(nullable);
});

it("encodes owner and organization separators without key collisions", () => {
  expect(navigationKey("owner:org", VIEW)).not.toBe(navigationKey("owner", "org", VIEW));
  expect(navigationKey("owner/one", VIEW)).toContain("owner%2Fone");
});

it("uses the server fallback path when window is unavailable", () => {
  vi.stubGlobal("window", undefined);
  try {
    expect(navigationKey(OWNER)).toBe("orbis.navigation.v1:%2F:owner-a");
  } finally {
    vi.unstubAllGlobals();
  }
});

it.each(["", "x".repeat(1025), "null", "{}"])("rejects empty, oversized and malformed envelopes: %s", saved => {
  const key = navigationKey(OWNER, VIEW);
  localStorage.setItem(key, saved);
  const { result } = renderHook(() => useNavigationState(key, HOME_VIEW, valid));
  expect(result.current[0]).toBe(HOME_VIEW);
});

it("keeps navigation usable when browser storage reads fail", () => {
  const key = navigationKey(OWNER, VIEW);
  const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("read blocked"); });
  try {
    const { result } = renderHook(() => useNavigationState(key, HOME_VIEW, valid));
    expect(result.current[0]).toBe(HOME_VIEW);
  } finally {
    spy.mockRestore();
  }
});

it("applies sequential functional updates and rejects invalid updater output", () => {
  const key = navigationKey(OWNER, "counter");
  const isCounter = (value: unknown): value is number => typeof value === "number" && value >= 0;
  const { result } = renderHook(() => useNavigationState(key, 0, isCounter));
  act(() => {
    result.current[1](previous => previous + 1);
    result.current[1](previous => previous + 1);
  });
  expect(result.current[0]).toBe(2);
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ version: 1, value: 2 });
  act(() => result.current[1](-1));
  expect(result.current[0]).toBe(2);
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ version: 1, value: 2 });
});

it("updates the new owner scope and preserves the previous owner's selection", () => {
  const oldKey = navigationKey(OWNER, VIEW);
  const newKey = navigationKey("owner-b", VIEW);
  localStorage.setItem(oldKey, JSON.stringify({ version: 1, value: LEDGER_VIEW }));
  const { result, rerender } = renderHook(({ key }) => useNavigationState<View>(key, HOME_VIEW, valid), { initialProps: { key: oldKey } });
  expect(result.current[0]).toBe(LEDGER_VIEW);
  rerender({ key: newKey });
  expect(result.current[0]).toBe(HOME_VIEW);
  act(() => result.current[1](LEDGER_VIEW));
  expect(JSON.parse(localStorage.getItem(newKey)!)).toEqual({ version: 1, value: LEDGER_VIEW });
  expect(JSON.parse(localStorage.getItem(oldKey)!)).toEqual({ version: 1, value: LEDGER_VIEW });
});

it("keeps owner and organization navigation isolated on scope changes", () => {
  const mounted = render(<Probe owner="owner-a:org-a" />);
  fireEvent.click(screen.getByRole("button", { name: HOME_VIEW }));
  mounted.rerender(<Probe owner="owner-b:org-a" />);
  expect(screen.getByRole("button", { name: HOME_VIEW })).toBeInTheDocument();
  mounted.rerender(<Probe owner="owner-a:org-b" />);
  expect(screen.getByRole("button", { name: HOME_VIEW })).toBeInTheDocument();
  mounted.rerender(<Probe owner="owner-a:org-a" />);
  expect(screen.getByRole("button", { name: LEDGER_VIEW })).toBeInTheDocument();
});

it.each(["broken-json", JSON.stringify({ version: 1, value: "unauthorized-view" }), JSON.stringify({ version: 99, value: LEDGER_VIEW })])("ignores corrupt or unsupported saved navigation: %s", (saved) => {
  localStorage.setItem(navigationKey(OWNER, VIEW), saved);
  render(<Probe owner={OWNER} />);
  expect(screen.getByRole("button", { name: HOME_VIEW })).toBeInTheDocument();
});

it("keeps the current view usable when browser storage writes fail", () => {
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage blocked"); });
  try {
    render(<Probe owner={OWNER} />);
    fireEvent.click(screen.getByRole("button", { name: HOME_VIEW }));
    expect(screen.getByRole("button", { name: LEDGER_VIEW })).toBeInTheDocument();
  } finally {
    spy.mockRestore();
  }
});
