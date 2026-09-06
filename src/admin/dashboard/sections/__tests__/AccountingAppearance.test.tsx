import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountingAppearanceSelector } from "../AccountingAppearanceSelector";
import {
  ACCOUNTING_APPEARANCE_STORAGE_KEY,
  DEFAULT_ACCOUNTING_APPEARANCE,
  readAccountingAppearance,
  writeAccountingAppearance,
} from "../accountingAppearance";

describe("Accounting appearance", () => {
  function memoryStorage(initial: Record<string, string> = {}) {
    const values = new Map(Object.entries(initial));
    return {
      getItem(key: string) {
        return values.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        values.set(key, value);
      },
    };
  }

  it("defaults to Signature Emerald and persists valid selections", () => {
    const storage = memoryStorage();
    expect(readAccountingAppearance(storage)).toBe(
      DEFAULT_ACCOUNTING_APPEARANCE,
    );
    writeAccountingAppearance("SIGNATURE_DARK", storage);
    expect(storage.getItem(ACCOUNTING_APPEARANCE_STORAGE_KEY)).toBe(
      "SIGNATURE_DARK",
    );
    expect(readAccountingAppearance(storage)).toBe("SIGNATURE_DARK");
  });

  it("falls back safely when storage contains an unknown value", () => {
    const storage = memoryStorage({
      [ACCOUNTING_APPEARANCE_STORAGE_KEY]: "UNKNOWN_THEME",
    });
    expect(readAccountingAppearance(storage)).toBe(
      DEFAULT_ACCOUNTING_APPEARANCE,
    );
  });

  it("offers Classic, Signature Emerald and Signature Emerald Dark", () => {
    const onChange = vi.fn();
    render(
      <AccountingAppearanceSelector
        value="SIGNATURE_LIGHT"
        onChange={onChange}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Classic \/ Existing/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Signature EmeraldPremium emerald, teal, white and soft-gold public design\.$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Signature Emerald Dark/i }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /Signature Emerald Dark/i }),
    );
    expect(onChange).toHaveBeenCalledWith("SIGNATURE_DARK");
  });
});
