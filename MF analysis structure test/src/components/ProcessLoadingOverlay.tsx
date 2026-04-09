import React, { useEffect, useState } from "react";

/** Covers the main stage only — parent must be `relative` + `overflow-hidden`. */
export function ProcessLoadingOverlay(props: { lines: string[]; active: boolean }) {
  const { lines, active } = props;
  const [bar, setBar] = useState(12);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      setBar((b) => (b >= 100 ? 8 : b + 6));
    }, 140);
    return () => window.clearInterval(id);
  }, [active]);

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-black/94 backdrop-blur-sm">
      <div className="h-1 w-full overflow-hidden bg-neutral-950">
        <div
          className="h-full rounded-r-full bg-gradient-to-r from-emerald-700 via-emerald-500 to-accent-pos shadow-[0_0_16px_rgba(74,222,128,0.25)] transition-[width] duration-300 ease-out"
          style={{ width: `${bar}%` }}
        />
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-2xl border border-white/[0.08] bg-terminal-surface/98 p-8 shadow-2xl">
          <div className="flex items-center gap-4 mb-6">
            <div className="relative h-11 w-11">
              <div className="absolute inset-0 rounded-full border border-emerald-500/35" />
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="h-5 w-5 animate-spin text-accent-pos" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path
                    className="opacity-90"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              </div>
            </div>
            <div>
              <div className="text-base font-semibold tracking-tight text-white">Processing</div>
              <div className="text-xs text-neutral-500 mt-0.5">Cleaning &amp; mapping data — status log</div>
            </div>
          </div>
          <div
            className="max-h-52 overflow-y-auto rounded-xl border border-white/[0.06] bg-black px-3 py-2 font-mono text-[11px] leading-relaxed text-neutral-400 tabular-nums"
            role="log"
            aria-live="polite"
          >
            {lines.length === 0 ? (
              <span className="text-neutral-600">Preparing pipeline…</span>
            ) : (
              lines.map((line, i) => (
                <div key={`${i}-${line.slice(0, 32)}`} className="py-1 border-b border-white/[0.05] last:border-0">
                  {line}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
