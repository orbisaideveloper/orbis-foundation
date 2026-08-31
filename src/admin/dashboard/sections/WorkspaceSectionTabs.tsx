import React from "react";

export function WorkspaceSectionTabs<T extends string>({
  ariaLabel,
  tabs,
  activeTab,
  onSelect,
}: Readonly<{
  ariaLabel: string;
  tabs: ReadonlyArray<readonly [T, string]>;
  activeTab: T;
  onSelect: (tab: T) => void;
}>) {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1"
      aria-label={ariaLabel}
    >
      {tabs.map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => onSelect(value)}
          className={`shrink-0 rounded-xl px-3 py-2 text-[10px] font-bold ${activeTab === value ? "bg-emerald-600 text-white" : "border border-emerald-100 bg-white text-slate-600"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
