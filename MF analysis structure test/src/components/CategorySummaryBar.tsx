import React, { useEffect, useMemo, useState } from "react";
import type { IBucketData, ITimeframeYears, IUiMode } from "../data/types";
import type { MetricsEngine } from "../data/metrics";
import { computeBenchmarkRangeForCategory } from "../data/benchmarkRangeFromPerfFiles";
import { categorySelectDisplayLabel } from "../utils/categoryDisplay";

/** Peer averages (return / TER / IR mean) only when more than one fund exists in the category in the active bucket. */
const MIN_FUNDS_FOR_CATEGORY_AVG_DISPLAY = 2;

/** One benchmark endpoint: negatives `(x)` in red; positives `x` in green; zero unbracketed neutral. */
function BenchmarkRangeEndpoint({ n }: { n: number }) {
  if (!Number.isFinite(n)) return <span className="text-neutral-500">—</span>;
  const s = n.toFixed(2);
  const cls = n < 0 ? "text-red-400" : n > 0 ? "text-emerald-400" : "text-slate-200";
  if (n < 0) {
    return <span className={cls}>({s})</span>;
  }
  return <span className={cls}>{s}</span>;
}

/** Min–max benchmark range; parentheses only on negative endpoints. */
function BenchmarkRangeDisplay({ r }: { r: { min: number; max: number } | null }) {
  if (!r) return <>—</>;
  const { min, max } = r;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return <>—</>;
  const same = min === max || Math.abs(min - max) < 1e-9;
  if (same) {
    return <BenchmarkRangeEndpoint n={min} />;
  }
  return (
    <>
      <BenchmarkRangeEndpoint n={min} />
      <span className="text-slate-500"> - </span>
      <BenchmarkRangeEndpoint n={max} />
    </>
  );
}

/** Text color for a numeric average: green / red / neutral by sign; gray when missing. */
function signedAvgClass(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "text-neutral-500";
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-red-400";
  return "text-slate-200";
}

function fmtPctPlain(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function fmtTerPlain(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toFixed(2);
}

function fmtIrPlain(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toFixed(2);
}

type BenchRange = { min: number; max: number } | null;

type BenchPair = { prev: BenchRange; latest: BenchRange };

export function CategorySummaryBar(props: {
  /** Dropdown filter (pick list / leaderboard) — optional note when it differs from some selected funds’ categories. */
  selectedCategory: string;
  selectedSchemeKeys: string[];
  timeframeYears: ITimeframeYears;
  uiMode: IUiMode;
  activeBucket: IBucketData;
  prevBucket: IBucketData;
  latestBucket: IBucketData;
  prevPerfFiles: File[];
  latestPerfFiles: File[];
  engine: MetricsEngine;
}) {
  const {
    selectedCategory,
    selectedSchemeKeys,
    timeframeYears,
    uiMode,
    activeBucket,
    prevBucket,
    latestBucket,
    prevPerfFiles,
    latestPerfFiles,
    engine
  } = props;

  /** Distinct non-empty fund.category values from the current comparison selection (stable sort). */
  const categoriesFromSelection = useMemo(() => {
    const seen = new Set<string>();
    for (const k of selectedSchemeKeys) {
      const c = activeBucket.fundsByKey.get(k)?.category?.trim();
      if (c) seen.add(c);
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [selectedSchemeKeys, activeBucket]);

  const showDropdownContextNote = useMemo(() => {
    if (!selectedCategory || !selectedSchemeKeys.length) return false;
    return selectedSchemeKeys.some((k) => {
      const c = activeBucket.fundsByKey.get(k)?.category?.trim();
      return Boolean(c && c !== selectedCategory);
    });
  }, [selectedCategory, selectedSchemeKeys, activeBucket]);

  /** Per canonical category: fund count in active bucket (for gating displayed averages only). */
  const fundCountByCategoryInActiveBucket = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of activeBucket.fundsByKey.values()) {
      const c = f.category?.trim();
      if (!c) continue;
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return m;
  }, [activeBucket]);

  const [benchByCategory, setBenchByCategory] = useState<Record<string, BenchPair>>({});
  const [benchLoading, setBenchLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cats = categoriesFromSelection;
    if (!cats.length) {
      setBenchByCategory({});
      setBenchLoading(false);
      return;
    }
    setBenchLoading(true);
    (async () => {
      try {
        const restrictFor = (bucket: IBucketData, cat: string) => {
          const s = new Set<string>();
          for (const k of selectedSchemeKeys) {
            const f = bucket.fundsByKey.get(k);
            if (f?.category?.trim() !== cat) continue;
            const label = f.perfSourceFileLabel?.trim();
            if (label) s.add(label);
          }
          return s.size > 0 ? s : undefined;
        };
        const entries = await Promise.all(
          cats.map(async (cat): Promise<[string, BenchPair]> => {
            if (uiMode === "both") {
              const [p, l] = await Promise.all([
                computeBenchmarkRangeForCategory(prevPerfFiles, cat, timeframeYears, restrictFor(prevBucket, cat)),
                computeBenchmarkRangeForCategory(latestPerfFiles, cat, timeframeYears, restrictFor(latestBucket, cat))
              ]);
              return [cat, { prev: p, latest: l }];
            }
            if (uiMode === "previous") {
              const p = await computeBenchmarkRangeForCategory(
                prevPerfFiles,
                cat,
                timeframeYears,
                restrictFor(prevBucket, cat)
              );
              return [cat, { prev: p, latest: null }];
            }
            const l = await computeBenchmarkRangeForCategory(
              latestPerfFiles,
              cat,
              timeframeYears,
              restrictFor(latestBucket, cat)
            );
            return [cat, { prev: null, latest: l }];
          })
        );
        if (!cancelled) {
          const next: Record<string, BenchPair> = {};
          for (const [cat, pair] of entries) next[cat] = pair;
          setBenchByCategory(next);
        }
      } finally {
        if (!cancelled) setBenchLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    categoriesFromSelection,
    selectedSchemeKeys,
    timeframeYears,
    uiMode,
    prevPerfFiles,
    latestPerfFiles,
    prevBucket,
    latestBucket
  ]);

  const horizonLabel = `${timeframeYears}Y`;

  if (!selectedSchemeKeys.length) {
    return (
      <div className="border-b border-white/[0.06] bg-black/50 px-4 py-3 lg:px-6">
        <div className="rounded-lg border border-dashed border-white/[0.12] bg-black/30 px-3 py-2.5 text-center">
          <p className="text-[11px] text-neutral-500 leading-relaxed">
            Add funds to the comparison to see benchmark ranges and peer averages for each <span className="text-neutral-400">category</span>{" "}
            represented in your selection (<span className="font-mono text-neutral-400">{horizonLabel}</span>).
          </p>
        </div>
      </div>
    );
  }

  if (!categoriesFromSelection.length) {
    return (
      <div className="border-b border-white/[0.06] bg-black/50 px-4 py-3 lg:px-6">
        <div className="rounded-lg border border-dashed border-white/[0.12] bg-black/30 px-3 py-2.5 text-center">
          <p className="text-[11px] text-neutral-500 leading-relaxed">
            Selected funds have no category in the loaded data — category-level benchmarks and averages are unavailable.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-white/[0.06] bg-black/50 px-4 py-3 lg:px-6">
      <div className="font-terminal text-[9px] font-semibold uppercase tracking-[0.2em] text-accent-pos/90 mb-2">Category summary</div>

      {showDropdownContextNote ? (
        <p className="mb-2 text-[10px] text-neutral-500 leading-snug">
          The category dropdown filters the pick list; the blocks below follow each selected fund’s category for benchmarks and peer averages.
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {categoriesFromSelection.map((cat) => {
          const stats = engine.getCategoryStats(activeBucket, cat, timeframeYears);
          const catCount = fundCountByCategoryInActiveBucket.get(cat) ?? 0;
          const showCategoryAverages = catCount >= MIN_FUNDS_FOR_CATEGORY_AVG_DISPLAY;
          const avgRet = showCategoryAverages ? (stats.avgReturnDirect ?? null) : null;
          const avgTer = showCategoryAverages ? (stats.avgTER ?? null) : null;
          const avgIr = showCategoryAverages ? (stats.avgInfoRatioDirect ?? null) : null;
          const bench = benchByCategory[cat];
          const catDisplay = categorySelectDisplayLabel(cat);

          return (
            <div
              key={cat}
              className="rounded-lg border border-white/[0.08] bg-black/45 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
            >
              <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-[10px] font-semibold text-slate-200 truncate max-w-full" title={cat}>
                  {catDisplay}
                </span>
                <span className="rounded border border-white/[0.1] bg-black/50 px-1.5 py-0.5 font-mono text-[9px] tabular-nums text-neutral-500">
                  {horizonLabel} horizon
                </span>
              </div>

              {!showCategoryAverages ? (
                <p className="mb-2 text-[9px] text-amber-200/80 leading-snug">
                  Category averages need at least {MIN_FUNDS_FOR_CATEGORY_AVG_DISPLAY} funds in this bucket for this category (
                  {catCount} present).
                </p>
              ) : null}

              <div
                className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${uiMode === "both" ? "xl:grid-cols-5" : "lg:grid-cols-4"}`}
              >
                {uiMode === "both" ? (
                  <>
                    <div className="min-w-0">
                      <div className="font-terminal text-[9px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                        Benchmark range (Previous)
                      </div>
                      <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-100">
                        {benchLoading ? <span className="text-neutral-500">…</span> : <BenchmarkRangeDisplay r={bench?.prev ?? null} />}
                      </div>
                      <div className="mt-0.5 text-[9px] text-neutral-600">
                        Return {horizonLabel} (%) Benchmark in selected funds’ source file(s), same category · single value if all
                        match
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="font-terminal text-[9px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                        Benchmark range (Latest)
                      </div>
                      <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-100">
                        {benchLoading ? <span className="text-neutral-500">…</span> : <BenchmarkRangeDisplay r={bench?.latest ?? null} />}
                      </div>
                      <div className="mt-0.5 text-[9px] text-neutral-600">
                        Return {horizonLabel} (%) Benchmark in selected funds’ source file(s), same category · single value if all
                        match
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="min-w-0">
                    <div className="font-terminal text-[9px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                      Benchmark range ({uiMode === "previous" ? "Previous" : "Latest"})
                    </div>
                    <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-100">
                      {benchLoading ? (
                        <span className="text-neutral-500">…</span>
                      ) : (
                        <BenchmarkRangeDisplay r={uiMode === "previous" ? bench?.prev ?? null : bench?.latest ?? null} />
                      )}
                    </div>
                    <div className="mt-0.5 text-[9px] text-neutral-600">
                      Return {horizonLabel} (%) Benchmark in selected funds’ source file(s), same category · single value if all match
                    </div>
                  </div>
                )}

                <div className="min-w-0">
                  <div className="font-terminal text-[9px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Category avg — direct return</div>
                  <div className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${signedAvgClass(avgRet)}`}>
                    {fmtPctPlain(avgRet)}
                  </div>
                  <div className="mt-0.5 text-[9px] text-neutral-600">From active view bucket · {horizonLabel}</div>
                </div>

                <div className="min-w-0">
                  <div className="font-terminal text-[9px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    Category avg — IR {horizonLabel} (Direct)
                  </div>
                  <div className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${signedAvgClass(avgIr)}`}>
                    {fmtIrPlain(avgIr)}
                  </div>
                  <div className="mt-0.5 text-[9px] text-neutral-600">
                    Mean of parsed Information Ratio* {horizonLabel} (Direct) in this category · active bucket (funds without a value
                    excluded)
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="font-terminal text-[9px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    Category avg — direct TER (%)
                  </div>
                  <div className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${signedAvgClass(avgTer)}`}>
                    {fmtTerPlain(avgTer)}
                  </div>
                  <div className="mt-0.5 text-[9px] text-neutral-600">
                    Mean of per-fund TER (TER CSV: Direct Plan - Total TER %) in this category · active bucket
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
