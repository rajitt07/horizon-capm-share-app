import React from "react";

/** Centered empty state when no fund is selected for analysis. */
export function AnalysisEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="mb-6 rounded-2xl border border-dashed border-white/[0.08] bg-black/45 p-8">
        <svg
          className="mx-auto h-14 w-14 text-accent-pos/80"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.25}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-white tracking-tight">No fund selected</h3>
      <p className="mt-2 max-w-sm text-sm text-neutral-400 leading-relaxed">
        Choose a category and add funds from the control bar above. Analysis and comparison will appear here.
      </p>
    </div>
  );
}
