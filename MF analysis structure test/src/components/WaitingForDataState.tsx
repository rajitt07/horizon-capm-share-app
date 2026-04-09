import React from "react";

function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-white/[0.06] ${className}`} aria-hidden />;
}

/** Pre-process placeholder: mirrors dashboard layout (ribbon, table, charts) without fake data. */
export function WaitingForDataState() {
  return (
    <div className="flex w-full min-w-0 flex-1 flex-col gap-5 pb-2">
      <p className="sr-only">
        Analysis workspace preview. Upload performance and TER files, then run Process Analysis from the configuration panel.
      </p>

      {/* Controls bar — same visual weight as real ControlsBar */}
      <div className="analytics-pill px-4 py-3">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <SkeletonLine className="h-7 w-28" />
            <SkeletonLine className="h-7 w-32" />
            <SkeletonLine className="h-7 w-36" />
            <span className="ml-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">View</span>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
            <SkeletonLine className="mb-2 h-3 w-24" />
            <SkeletonLine className="h-9 w-full max-w-md" />
            <div className="mt-3 flex flex-wrap gap-2">
              <SkeletonLine className="h-7 w-20" />
              <SkeletonLine className="h-7 w-24" />
            </div>
          </div>
        </div>
      </div>

      {/* Comparison + ribbon + table (single card like post-process) */}
      <section className="analytics-card flex min-h-[280px] flex-col overflow-hidden p-0" aria-hidden>
        <div className="border-b border-white/[0.06] bg-black/40 px-4 py-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="font-terminal text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-600">
              Comparison ribbon
            </span>
            <SkeletonLine className="h-5 w-10" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex min-h-[100px] flex-col rounded-xl border border-white/[0.06] bg-black/35 p-3"
              >
                <SkeletonLine className="mb-2 h-3 w-3/4 max-w-[180px]" />
                <SkeletonLine className="mb-1 h-2 w-1/2 max-w-[100px]" />
                <div className="mt-auto flex justify-between gap-2 pt-3">
                  <SkeletonLine className="h-6 w-16" />
                  <SkeletonLine className="h-6 w-14" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="px-4 pb-4 pt-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <SkeletonLine className="h-5 w-32" />
            <SkeletonLine className="h-8 w-40" />
          </div>
          <div className="table-wrap overflow-hidden rounded-lg border border-white/[0.06]">
            <div className="space-y-0 p-2">
              <div className="flex gap-2 border-b border-white/[0.05] pb-2">
                <SkeletonLine className="h-4 w-24 shrink-0" />
                <SkeletonLine className="h-4 flex-1" />
                <SkeletonLine className="h-4 w-20 shrink-0" />
              </div>
              {[0, 1, 2, 3, 4].map((r) => (
                <div
                  key={r}
                  className={`flex gap-2 py-2.5 ${r < 4 ? "border-b border-white/[0.04]" : ""}`}
                >
                  <SkeletonLine className="h-3 w-28 shrink-0 self-center" />
                  <SkeletonLine className="h-3 flex-1 self-center" />
                  <SkeletonLine className="h-3 w-16 shrink-0 self-center" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Charts row — matches Alpha chart card */}
      <div className="grid grid-cols-1 gap-4">
        <section className="analytics-card flex flex-col gap-3" aria-hidden>
          <div className="font-terminal text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
            Alpha by horizon (avg)
          </div>
          <div className="flex h-[200px] items-end justify-center gap-4 rounded-lg border border-white/[0.06] bg-black/40 px-6 pb-10 pt-6">
            {["1Y", "3Y", "5Y", "10Y"].map((label, i) => (
              <div key={label} className="flex flex-col items-center gap-2">
                <div
                  className="w-10 animate-pulse rounded-t-md bg-emerald-500/20 sm:w-12"
                  style={{ height: `${40 + i * 18}px` }}
                />
                <span className="text-[10px] font-mono text-neutral-600">{label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* CTA */}
      <div className="rounded-2xl border border-dashed border-white/[0.08] bg-black/30 px-6 py-8 text-center">
        <h2 className="text-base font-semibold tracking-tight text-white">No analysis yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500 leading-relaxed">
          Configure both buckets in the sidebar, then click <span className="font-medium text-neutral-300">Process Analysis</span>{" "}
          to parse files and populate the workspace above.
        </p>
      </div>
    </div>
  );
}
