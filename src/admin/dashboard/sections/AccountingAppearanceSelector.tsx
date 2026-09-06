import React from "react";
import { Palette } from "lucide-react";
import {
  ACCOUNTING_APPEARANCES,
  type AccountingAppearance,
} from "./accountingAppearance";
import {
  accountingText,
  type AccountingLanguage,
} from "./accountingI18n";

export function AccountingAppearanceSelector({
  value,
  onChange,
  language = "EN",
}: Readonly<{
  value: AccountingAppearance;
  onChange: (appearance: AccountingAppearance) => void;
  language?: AccountingLanguage;
}>) {
  return (
    <section
      className="rounded-2xl border border-emerald-100 bg-white/90 p-3 shadow-sm"
      aria-label={accountingText(language, "appearance.aria")}
    >
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <Palette className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[10px] font-black text-slate-900">
            {accountingText(language, "appearance.title")}
          </p>
          <p className="text-[9px] text-slate-500">
            {accountingText(language, "appearance.subtitle")}
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {ACCOUNTING_APPEARANCES.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={value === item.value}
            onClick={() => onChange(item.value)}
            className={`rounded-xl border p-2.5 text-left transition ${
              value === item.value
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            <span className="block text-[10px] font-black">
              {accountingText(
                language,
                item.value === "CLASSIC"
                  ? "appearance.classic.label"
                  : item.value === "SIGNATURE_LIGHT"
                    ? "appearance.signature.label"
                    : "appearance.signatureDark.label",
              )}
            </span>
            <span className="mt-1 block text-[8px] leading-relaxed opacity-80">
              {accountingText(
                language,
                item.value === "CLASSIC"
                  ? "appearance.classic.description"
                  : item.value === "SIGNATURE_LIGHT"
                    ? "appearance.signature.description"
                    : "appearance.signatureDark.description",
              )}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
