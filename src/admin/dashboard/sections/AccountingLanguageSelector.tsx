import React from "react";
import { Languages } from "lucide-react";
import {
  ACCOUNTING_LANGUAGES,
  accountingText,
  type AccountingLanguage,
} from "./accountingI18n";

export function AccountingLanguageSelector({
  value,
  onChange,
}: Readonly<{
  value: AccountingLanguage;
  onChange: (language: AccountingLanguage) => void;
}>) {
  return (
    <section
      className="rounded-2xl border border-emerald-100 bg-white/90 p-3 shadow-sm"
      aria-label={accountingText(value, "language.aria")}
    >
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <Languages className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-black text-slate-900">
            {accountingText(value, "language.title")}
          </p>
          <p className="text-[9px] text-slate-500">
            {accountingText(value, "language.subtitle")}
          </p>
        </div>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {ACCOUNTING_LANGUAGES.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-label={`${item.nativeLabel} · ${item.shortLabel}`}
            aria-pressed={value === item.value}
            onClick={() => onChange(item.value)}
            className={`min-h-11 shrink-0 rounded-xl border px-3 py-2 text-left transition ${
              value === item.value
                ? "border-emerald-300 bg-emerald-50 text-emerald-900 shadow-sm"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            <span className="block text-[10px] font-black">
              {item.nativeLabel}
            </span>
            <span className="mt-0.5 block text-[8px] font-bold opacity-60">
              {item.shortLabel}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
