import React, { useState } from "react";

export function SidebarAccordion(props: {
  title: string;
  /** e.g. status dot */
  trailing?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const { title, trailing, defaultOpen = true, children } = props;
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="glass-panel overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
        aria-expanded={open}
      >
        <span className="font-terminal text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">{title}</span>
        <span className="flex items-center gap-2 shrink-0">
          {trailing}
          <ChevronIcon open={open} />
        </span>
      </button>
      {open ? <div className="border-t border-white/10 p-3 space-y-3">{children}</div> : null}
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
