import React, { useMemo } from "react";
import type { IBucketData, ITimeframeYears, IUiMode, IJoinedFund } from "../data/types";
import { categorySelectDisplayLabel } from "../utils/categoryDisplay";

function alphaAtHorizon(f: IJoinedFund | undefined, y: ITimeframeYears): number | null {
  if (!f) return null;
  const v = f.alphaByHorizon[y];
  return v === undefined || v === null || !Number.isFinite(v) ? null : v;
}
function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function RibbonEmptyGraphic() {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
      <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.08] bg-gradient-to-br from-neutral-950 to-black shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <svg className="h-9 w-9 text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden>
          <path d="M4 19V5M4 19h16M8 15V9M12 15v-4M16 15v-7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 5l4 4 4-3 4 5 4-4" strokeLinecap="round" strokeLinejoin="round" className="text-accent-pos/50" />
        </svg>
        <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/5" />
      </div>
      <p className="max-w-xs text-sm font-medium text-neutral-500 leading-relaxed">
        Select funds to begin deep-dive comparison.
      </p>
    </div>
  );
}

export function ComparisonMetricRibbon(props: {
  uiMode: IUiMode;
  bucketPrevious: IBucketData;
  bucketLatest: IBucketData;
  schemeKeysOrdered: string[];
  ribbonHiddenKeys: ReadonlySet<string>;
  timeframeYears: ITimeframeYears;
  activeSchemeKey: string;
  onSetActive: (schemeKey: string) => void;
  onRemoveFromSelection: (schemeKey: string) => void;
}) {
  const {
    uiMode,
    bucketPrevious,
    bucketLatest,
    schemeKeysOrdered,
    ribbonHiddenKeys,
    timeframeYears,
    activeSchemeKey,
    onSetActive,
    onRemoveFromSelection
  } = props;

  const visibleKeys = useMemo(
    () => schemeKeysOrdered.filter((k) => !ribbonHiddenKeys.has(k)),
    [schemeKeysOrdered, ribbonHiddenKeys]
  );

  const cards = useMemo(() => {
    return visibleKeys
      .map((schemeKey) => {
        const fundPrev = bucketPrevious.fundsByKey.get(schemeKey);
        const fundLatest = bucketLatest.fundsByKey.get(schemeKey);
        const meta = fundLatest ?? fundPrev;
        if (!meta) return null;

        const name = fundLatest?.schemeName ?? fundPrev?.schemeName ?? schemeKey;
        const rawCat = fundLatest?.category ?? fundPrev?.category ?? "";
        const cat = typeof rawCat === "string" ? rawCat.trim() : "";
        const catForDisplay = cat ? categorySelectDisplayLabel(cat) : "";

        const aPrev = alphaAtHorizon(fundPrev, timeframeYears);
        const aLatest = alphaAtHorizon(fundLatest, timeframeYears);

        let alpha: number | null;
        if (uiMode === "previous") alpha = aPrev;
        else if (uiMode === "latest") alpha = aLatest;
        else alpha = aLatest ?? aPrev;

        const alphaPrev = uiMode === "both" ? aPrev : null;
        const alphaLatest = uiMode === "both" ? aLatest : null;

        return {
          schemeKey,
          name,
          alpha,
          catShort: catForDisplay ? (catForDisplay.length > 22 ? `${catForDisplay.slice(0, 20)}…` : catForDisplay) : "—",
          catTitle: cat || undefined,
          alphaPrev,
          alphaLatest
        };
      })
      .filter(Boolean) as Array<{
      schemeKey: string;
      name: string;
      alpha: number | null;
      catShort: string;
      catTitle?: string;
      alphaPrev: number | null;
      alphaLatest: number | null;
    }>;
  }, [visibleKeys, bucketPrevious, bucketLatest, timeframeYears, uiMode]);

  const emptySelection = schemeKeysOrdered.length === 0;

  return (
    <div
      className={`sticky top-0 z-30 -mx-4 border-b px-4 py-3.5 backdrop-blur-md lg:-mx-6 lg:px-6 ${
        uiMode === "both"
          ? "border-cyan-500/15 bg-gradient-to-r from-black/90 via-teal-950/20 to-black/90 shadow-[inset_0_1px_0_rgba(45,212,191,0.06)]"
          : "border-white/[0.06] bg-black/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div
          className={`font-terminal text-[10px] font-semibold uppercase tracking-[0.22em] ${
            uiMode === "both" ? "text-cyan-300/95" : "text-accent-pos"
          }`}
        >
          Comparison ribbon
        </div>
        <span className="rounded-md border border-white/[0.08] bg-black/40 px-2 py-0.5 font-mono text-[9px] tabular-nums text-neutral-500">
          {timeframeYears}Y
        </span>
      </div>
      {emptySelection ? (
        <RibbonEmptyGraphic />
      ) : cards.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          All selected funds are hidden — use the <span className="text-slate-400">Metric ribbon</span> row in the table to show cards again.
        </p>
      ) : (
        <div className="pr-1">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 auto-rows-min">
            {cards.map((c) => {
              const active = activeSchemeKey === c.schemeKey;
              const pos = c.alpha !== null && Number.isFinite(c.alpha) && c.alpha >= 0;
              const showTrend = uiMode === "both";
              const cur = showTrend ? c.alphaLatest : c.alpha;
              const curPos = cur !== null && Number.isFinite(cur) && cur >= 0;
              const bothLatestChrome =
                uiMode === "both"
                  ? active
                    ? "border-cyan-400/50 bg-gradient-to-b from-teal-950/70 to-cyan-950/40 shadow-[0_0_28px_rgba(34,211,238,0.18),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md"
                    : "border-cyan-500/30 bg-teal-950/35 hover:border-cyan-400/45 hover:bg-teal-950/50 backdrop-blur-sm shadow-[inset_0_0_0_1px_rgba(45,212,191,0.08)]"
                  : active
                    ? "border-accent-pos/45 bg-neutral-950/90 shadow-[0_0_28px_rgba(74,222,128,0.12),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md"
                    : "border-white/[0.08] bg-black/40 hover:border-white/12 hover:bg-black/55 backdrop-blur-sm";

              return (
                <div
                  key={c.schemeKey}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSetActive(c.schemeKey)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSetActive(c.schemeKey);
                    }
                  }}
                  className={`group relative flex min-h-[118px] min-w-0 flex-col rounded-xl border px-3 py-2.5 transition-all ${bothLatestChrome}`}
                >
                  <button
                    type="button"
                    className="absolute right-1 top-1 rounded p-0.5 text-slate-500 opacity-0 transition-opacity hover:bg-slate-800 hover:text-slate-300 group-hover:opacity-100"
                    title="Remove from comparison"
                    aria-label="Remove fund from comparison"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveFromSelection(c.schemeKey);
                    }}
                  >
                    ×
                  </button>
                  <div className="pr-5 font-terminal text-[10px] font-semibold uppercase tracking-wide text-slate-300 truncate" title={c.name}>
                    {c.name}
                  </div>
                  <div className="mt-0.5 truncate text-[9px] text-slate-500" title={c.catTitle ?? c.catShort}>
                    {c.catShort}
                  </div>
                  <div className="mt-2.5 min-w-0">
                    {showTrend ? (
                      <>
                        <div className="font-terminal text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">Alpha</div>
                        <div
                          className={`font-mono text-base font-bold tabular-nums leading-tight ${
                            cur === null || !Number.isFinite(cur)
                              ? "text-slate-500"
                              : curPos
                                ? "text-cyan-300 drop-shadow-[0_0_12px_rgba(34,211,238,0.35)]"
                                : "text-rose-300"
                          }`}
                        >
                          {fmtPct(c.alphaLatest)}{" "}
                          <span className="text-[10px] font-normal text-cyan-200/60">(Latest)</span>
                        </div>
                        <div className="mt-1 text-[10px] text-slate-500">
                          vs Prev:{" "}
                          <span className="font-mono tabular-nums text-slate-400">{fmtPct(c.alphaPrev)}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="font-terminal text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">α {timeframeYears}Y</div>
                        <div
                          className={`font-mono text-base font-bold tabular-nums ${
                            c.alpha === null || !Number.isFinite(c.alpha) ? "text-slate-500" : pos ? "text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.35)]" : "text-rose-300"
                          }`}
                        >
                          {fmtPct(c.alpha)}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
