import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountingLanguageSelector } from "../AccountingLanguageSelector";
import {
  ACCOUNTING_LANGUAGE_STORAGE_KEY,
  DEFAULT_ACCOUNTING_LANGUAGE,
  accountingGreetingForHour,
  accountingHtmlLang,
  accountingText,
  readAccountingLanguage,
  writeAccountingLanguage,
} from "../accountingI18n";

describe("Accounting public i18n", () => {
  const CURRENT_MODE_KEY = "public.currentMode";

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

  it("keeps language as a local public preference with a stable English default", () => {
    const storage = memoryStorage();
    expect(readAccountingLanguage(storage)).toBe(DEFAULT_ACCOUNTING_LANGUAGE);

    writeAccountingLanguage("BN", storage);

    expect(storage.getItem(ACCOUNTING_LANGUAGE_STORAGE_KEY)).toBe("BN");
    expect(readAccountingLanguage(storage)).toBe("BN");
  });

  it("falls back safely when the stored language is unsupported", () => {
    const storage = memoryStorage({
      [ACCOUNTING_LANGUAGE_STORAGE_KEY]: "XX",
    });

    expect(readAccountingLanguage(storage)).toBe(DEFAULT_ACCOUNTING_LANGUAGE);
  });

  it("provides English, Bengali and Hindi public copy without changing data", () => {
    expect(accountingText("EN", CURRENT_MODE_KEY)).toBe("Current Mode");
    expect(accountingText("BN", CURRENT_MODE_KEY)).toBe("বর্তমান মোড");
    expect(accountingText("HI", CURRENT_MODE_KEY)).toBe("करंट मोड");
    expect(accountingHtmlLang("BN")).toBe("bn-IN");
  });

  it("returns time-aware greetings in the selected public language", () => {
    expect(accountingGreetingForHour("EN", 8)).toBe("Good morning");
    expect(accountingGreetingForHour("BN", 14)).toBe("শুভ অপরাহ্ণ");
    expect(accountingGreetingForHour("HI", 19)).toBe("शुभ संध्या");
  });

  it("lets the public preview switch language without an organization setting", () => {
    const onChange = vi.fn();

    render(<AccountingLanguageSelector value="EN" onChange={onChange} />);

    expect(
      screen.getByRole("button", { name: "English · EN" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "বাংলা · BN" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "हिन्दी · HI" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "বাংলা · BN" }));
    expect(onChange).toHaveBeenCalledWith("BN");
  });
});
