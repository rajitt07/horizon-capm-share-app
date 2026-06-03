/** Comparison grid: returns/alpha/score use the global Horizon selector. */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { IBucketData, ITimeframeYears, IFundRankingSnapshot } from "../data/types";
import type { IJoinedFund } from "../data/types";
import { createMetricsEngine, type MetricsEngine } from "../data/metrics";
import { resolveCrossBucketAum } from "../data/crossBucketAum";
import { compareByScoreReturnAlphaWithRankable } from "../data/peerSuggestions";
import { fundHasNoReturnHistory } from "../data/utils";
import { ScoreWhyLayer } from "./ScoreWhyLayer";

export type ComparisonTableHandle = {
  scrollToScheme: (schemeKey: string) => void;
};

type ColumnMode = "previous" | "latest";

const FUND_COL_MIN_PX = 300;
const STICKY_LABEL_COL_PX = 220;

const ROW_DEFS: Array<{ key: string; label: (tf: ITimeframeYears) => string; title?: string }> = [
  { key: "ribbonToggle", label: () => "Metric ribbon" },
  { key: "benchmark", label: () => "Benchmark" },
  { key: "return", label: (tf) => `Return ${tf}Y (%) Direct` },
  {
    key: "returnSinceLaunchDirectBenchmark",
    label: () => "Return since launch (%)",
    title:
      'From performance file column “Return Since Launch Direct Benchmark” when present. Not tied to the horizon selector; NA if the column is missing.'
  },
  { key: "alpha", label: (tf) => `Alpha ${tf}Y (vs bmk)` },
  {
    key: "infoRatioDirect",
    label: (tf) => `Information ratio ${tf}Y (Direct)`,
    title: "From performance file column “Information Ratio* {horizon} Year (Direct)” (and close variants). NA if missing."
  },
  {
    key: "ter",
    label: () => "Direct Total TER (%)",
    title: "From the uploaded TER CSV: column “Direct Plan - Total TER (%)” when present; otherwise legacy header detection."
  },
  { key: "aum", label: () => "Current AUM (Cr.)" },
  {
    key: "aumChange",
    label: () => "AUM change (Cr.)",
    title:
      "Latest minus Previous AUM (Cr.), with % vs prior when prior > 0. Shown in Latest and Prev vs Latest views only; Previous-month-only view shows NA. Same matching as score."
  }
];

const METRIC_SECTIONS: Array<{ title: string; keys: string[] }> = [
  { title: "Overview & tools", keys: ["ribbonToggle", "benchmark"] },
  { title: "Returns, cost & alpha", keys: ["return", "returnSinceLaunchDirectBenchmark", "alpha", "infoRatioDirect", "ter"] },
  { title: "AUM", keys: ["aum", "aumChange"] }
];

/** First-column labels to center-align (overrides global tbody th text-align). */
const METRIC_ROW_LABEL_CENTER_KEYS = new Set([
  "return",
  "returnSinceLaunchDirectBenchmark",
  "alpha",
  "infoRatioDirect",
  "ter",
  "aum",
  "aumChange"
]);

function format2(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "NA";
  return v.toFixed(2);
}

/** Delta matches `computeScoreDetails` AUM growth; % = diff / prior AUM when prior > 0. */
function getAumChangeDisplay(
  bucketPrevious: IBucketData,
  bucketLatest: IBucketData,
  schemeKey: string
): { delta: number | null; pct: number | null; unmatched: boolean } {
  const cross = resolveCrossBucketAum(bucketPrevious, bucketLatest, schemeKey);
  if (cross.match === "unmatched" || cross.match === "none") {
    return { delta: null, pct: null, unmatched: true };
  }
  let delta: number | null = null;
  if (cross.aumDiff !== null && Number.isFinite(cross.aumDiff)) delta = cross.aumDiff;
  let pct: number | null = null;
  if (
    cross.aumPrev !== null &&
    Number.isFinite(cross.aumPrev) &&
    cross.aumPrev > 0 &&
    cross.aumDiff !== null &&
    Number.isFinite(cross.aumDiff)
  ) {
    pct = (cross.aumDiff / cross.aumPrev) * 100;
  }
  return { delta, pct, unmatched: false };
}

function formatSignedCr(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "NA";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}`;
}

function formatPctBracket(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "(—)";
  const sign = pct > 0 ? "+" : "";
  return `(${sign}${pct.toFixed(2)}%)`;
}

function AlphaPill({ alpha }: { alpha: number | null | undefined }) {
  if (alpha === null || alpha === undefined || !Number.isFinite(alpha)) {
    return <span className="font-mono text-[10px] font-semibold tabular-nums text-slate-500">NA</span>;
  }
  const pos = alpha > 0;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums ring-1 ${
        pos
          ? "bg-emerald-500/12 text-emerald-400 ring-emerald-500/35 shadow-[0_0_16px_rgba(52,211,153,0.18)]"
          : "bg-rose-500/10 text-rose-300 ring-rose-500/35"
      }`}
    >
      {alpha >= 0 ? "+" : ""}
      {alpha.toFixed(2)}%
    </span>
  );
}

function FundNotOldEnoughMessage() {
  return (
    <span className="block max-w-[11rem] px-1 text-center text-[9px] font-medium leading-snug text-amber-200/90">
      Fund not old enough
    </span>
  );
}

function ReturnPill({ v }: { v: number | null | undefined }) {
  if (v === null || v === undefined || !Number.isFinite(v)) {
    return <span className="font-mono text-[10px] tabular-nums text-slate-500">NA</span>;
  }
  const pos = v >= 0;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] tabular-nums ring-1 ${
        pos
          ? "border-slate-800/40 bg-slate-800/40 text-emerald-400 ring-slate-700/50"
          : "border-slate-800/40 bg-slate-800/40 text-rose-300 ring-slate-700/50"
      }`}
    >
      {v >= 0 ? "+" : ""}
      {v.toFixed(2)}%
    </span>
  );
}

function getSnapshotOrCompute(
  engine: MetricsEngine,
  rankings: IBucketData["rankingsByHorizon"],
  horizon: ITimeframeYears,
  schemeKey: string,
  bucketSide: IBucketData,
  bucketPrevious: IBucketData,
  bucketLatest: IBucketData,
  category: string
): IFundRankingSnapshot {
  const m = rankings?.[horizon];
  const pre = m?.get(schemeKey);
  if (pre) return pre;
  return engine.computeFundRankingSnapshot({
    bucketSide,
    schemeKey,
    category,
    horizonYears: horizon,
    bucketPrevious,
    bucketLatest
  });
}

type ComparisonTableProps = {
  bucketPrevious: IBucketData;
  bucketLatest: IBucketData;
  uiMode: "previous" | "latest" | "both";
  timeframeYears: ITimeframeYears;
  onTimeframeChange: (t: ITimeframeYears) => void;
  canCompute: boolean;
  selectedCategory: string;
  selectedSchemeKeys: string[];
  activeSchemeKey: string;
  setActiveSchemeKey: (k: string) => void;
  rankMode?: boolean;
  onMetricRowHover?: (metricKey: string | null) => void;
  ribbonHiddenKeys: ReadonlySet<string>;
  onRibbonToggle: (schemeKey: string) => void;
  rankingsPrev?: IBucketData["rankingsByHorizon"];
  rankingsLatest?: IBucketData["rankingsByHorizon"];
  onSelectAll?: () => void;
  selectAllDisabled?: boolean;
  /** When set, clarifies scope: all bucket funds vs current category only (see App fundsForSelectAllScope). */
  selectAllButtonLabel?: string;
};

export const ComparisonTable = forwardRef<ComparisonTableHandle, ComparisonTableProps>(function ComparisonTable(props, ref) {
  const {
    bucketPrevious,
    bucketLatest,
    uiMode,
    timeframeYears,
    onTimeframeChange,
    canCompute,
    selectedCategory,
    selectedSchemeKeys,
    activeSchemeKey,
    setActiveSchemeKey,
    rankMode,
    onMetricRowHover,
    ribbonHiddenKeys,
    onRibbonToggle,
    rankingsPrev,
    rankingsLatest,
    onSelectAll,
    selectAllDisabled,
    selectAllButtonLabel = "Select all in category"
  } = props;

  const engine = useMemo(() => createMetricsEngine(), []);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [whyOpen, setWhyOpen] = useState<{ schemeKey: string; pos: { top: number; left: number } } | null>(null);

  useEffect(() => {
    setWhyOpen(null);
  }, [timeframeYears, uiMode]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToScheme: (schemeKey: string) => {
        const root = scrollRef.current;
        if (!root) return;
        const esc =
          typeof CSS !== "undefined" && typeof CSS.escape === "function"
            ? CSS.escape(schemeKey)
            : schemeKey.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const el = root.querySelector<HTMLElement>(`[data-scheme-anchor="${esc}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      }
    }),
    []
  );

  const horizons: ITimeframeYears[] = ["1", "3", "5", "10"];

  const displaySchemeKeys = useMemo(() => {
    if (!rankMode) return selectedSchemeKeys;
    const sideBucket: IBucketData = uiMode === "previous" ? bucketPrevious : bucketLatest;
    const rankMap = uiMode === "previous" ? rankingsPrev?.[timeframeYears] : rankingsLatest?.[timeframeYears];
    const scored: Array<{ k: string; score: number; name: string; fund: IJoinedFund; rankable: boolean }> = [];
    if (rankMap && rankMap.size > 0) {
      for (const k of selectedSchemeKeys) {
        const fund = sideBucket.fundsByKey.get(k);
        if (!fund) continue;
        const cat = fund.category?.trim() ?? "";
        if (!cat) continue;
        const snap = rankMap.get(k);
        if (!snap) continue;
        scored.push({ k, score: snap.score, name: fund.schemeName, fund, rankable: snap.rankable ?? false });
      }
    } else {
      for (const k of selectedSchemeKeys) {
        const fund = sideBucket.fundsByKey.get(k);
        if (!fund) continue;
        const cat = fund.category?.trim() ?? "";
        if (!cat) continue;
        const details = engine.computeScoreDetails({
          bucketSide: sideBucket,
          schemeKey: k,
          category: cat,
          horizonYears: timeframeYears,
          bucketPrevious,
          bucketLatest
        });
        scored.push({ k, score: details.score, name: fund.schemeName, fund, rankable: details.rankable });
      }
    }
    scored.sort((a, b) =>
      compareByScoreReturnAlphaWithRankable(a.score, a.fund, a.rankable, b.score, b.fund, b.rankable, timeframeYears)
    );
    const order = new Set(scored.map((s) => s.k));
    const tail = selectedSchemeKeys.filter((k) => !order.has(k));
    return scored.map((s) => s.k).concat(tail);
  }, [
    rankMode,
    selectedSchemeKeys,
    uiMode,
    bucketPrevious,
    bucketLatest,
    timeframeYears,
    engine,
    rankingsPrev,
    rankingsLatest
  ]);

  const columns = useMemo(() => {
    if (uiMode === "both") {
      return displaySchemeKeys.flatMap((schemeKey) => {
        const fundPrev = bucketPrevious.fundsByKey.get(schemeKey);
        const fundLatest = bucketLatest.fundsByKey.get(schemeKey);
        const fundName = fundLatest?.schemeName ?? fundPrev?.schemeName ?? schemeKey;
        return [
          {
            id: `${schemeKey}__previous`,
            schemeKey,
            mode: "previous" as ColumnMode,
            fundName,
            periodShort: "Prev" as const,
            header: `${fundName} (Prev)`
          },
          {
            id: `${schemeKey}__latest`,
            schemeKey,
            mode: "latest" as ColumnMode,
            fundName,
            periodShort: "Latest" as const,
            header: `${fundName} (Latest)`
          }
        ];
      });
    }

    const side: ColumnMode = uiMode === "previous" ? "previous" : "latest";
    return displaySchemeKeys.map((schemeKey) => {
      const fund = side === "previous" ? bucketPrevious.fundsByKey.get(schemeKey) : bucketLatest.fundsByKey.get(schemeKey);
      const fundName = fund?.schemeName ?? schemeKey;
      return { id: schemeKey, schemeKey, mode: side, fundName, periodShort: undefined, header: fundName };
    });
  }, [uiMode, displaySchemeKeys, bucketPrevious.fundsByKey, bucketLatest.fundsByKey]);

  const columnData = useMemo(() => {
    const out = new Map<string, any>();
    for (const col of columns) {
      const bucketSide = col.mode === "previous" ? bucketPrevious : bucketLatest;
      const fundSide = bucketSide.fundsByKey.get(col.schemeKey);

      const rawCat = fundSide?.category ?? selectedCategory ?? "";
      const category = typeof rawCat === "string" ? rawCat.trim() : "";
      const rankingsForSide = col.mode === "previous" ? rankingsPrev : rankingsLatest;
      const details = fundSide
        ? getSnapshotOrCompute(
            engine,
            rankingsForSide,
            timeframeYears,
            col.schemeKey,
            bucketSide,
            bucketPrevious,
            bucketLatest,
            category
          )
        : null;

      out.set(col.id, { bucketSide, fundSide, details });
    }
    return out;
  }, [
    columns,
    bucketPrevious,
    bucketLatest,
    selectedCategory,
    timeframeYears,
    engine,
    bucketPrevious.fundsByKey,
    bucketLatest.fundsByKey,
    rankingsPrev,
    rankingsLatest
  ]);

  const whyPopoverPayload = useMemo(() => {
    if (!whyOpen) return null;
    const schemeKey = whyOpen.schemeKey;
    const fund =
      bucketLatest.fundsByKey.get(schemeKey) ?? bucketPrevious.fundsByKey.get(schemeKey);
    if (!fund) return null;
    const cat = fund.category ?? selectedCategory ?? "";
    if (uiMode === "both") {
      const snapPrev = getSnapshotOrCompute(engine, rankingsPrev, timeframeYears, schemeKey, bucketPrevious, bucketPrevious, bucketLatest, cat);
      const snapLatest = getSnapshotOrCompute(engine, rankingsLatest, timeframeYears, schemeKey, bucketLatest, bucketPrevious, bucketLatest, cat);
      return {
        dual: true as const,
        fundName: fund.schemeName,
        conditionsPrev: snapPrev.conditions,
        conditionsLatest: snapLatest.conditions,
        missingInputsPrev: snapPrev.missingInputs,
        missingInputsLatest: snapLatest.missingInputs
      };
    }
    const sideBucket = uiMode === "previous" ? bucketPrevious : bucketLatest;
    const rankings = uiMode === "previous" ? rankingsPrev : rankingsLatest;
    const snap = getSnapshotOrCompute(engine, rankings, timeframeYears, schemeKey, sideBucket, bucketPrevious, bucketLatest, cat);
    return {
      dual: false as const,
      fundName: fund.schemeName,
      conditions: snap.conditions,
      missingInputs: snap.missingInputs
    };
  }, [
    whyOpen,
    bucketLatest,
    bucketPrevious,
    selectedCategory,
    timeframeYears,
    engine,
    rankingsPrev,
    rankingsLatest,
    uiMode
  ]);

  const renderMetricCell = useCallback(
    (rowKey: string, col: (typeof columns)[0]) => {
      const data = columnData.get(col.id);
      const fundSide: IJoinedFund | undefined = data?.fundSide;

      switch (rowKey) {
        case "ribbonToggle": {
          const showToggle = uiMode !== "both" || col.mode === "latest";
          if (!showToggle) {
            return (
              <td
                key={col.id}
                className={["comparison-fund-cell", "text-center", "text-slate-600", "text-[10px]"].filter(Boolean).join(" ")}
              >
                —
              </td>
            );
          }
          const hidden = ribbonHiddenKeys.has(col.schemeKey);
          return (
            <td key={col.id} className={["text-center", "align-middle", "comparison-fund-cell"].filter(Boolean).join(" ")}>
              <button
                type="button"
                className={`rounded-full px-2 py-0.5 text-[9px] font-terminal font-semibold uppercase tracking-wide border transition-colors ${
                  hidden ? "border-slate-600 text-slate-500 hover:border-slate-500" : "border-emerald-500/45 text-emerald-400 hover:border-emerald-400/80"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRibbonToggle(col.schemeKey);
                }}
                title={hidden ? "Show mini-card in comparison ribbon" : "Hide mini-card from ribbon"}
              >
                {hidden ? "Show" : "Hide"}
              </button>
            </td>
          );
        }
        case "benchmark":
          return (
            <td
              key={col.id}
              className={[
                "comparison-fund-cell",
                "whitespace-normal",
                "break-words",
                "text-center",
                "text-[10px]",
                "sm:text-[11px]",
                "leading-snug"
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {fundSide ? fundSide.benchmarkName ?? "NA" : "NA"}
            </td>
          );
        case "return":
          return (
            <td
              key={col.id}
              className={["num-cell", "w-full", "text-center", "text-[10px]", "sm:text-[11px]", "comparison-fund-cell"]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="flex w-full justify-center">
                {fundHasNoReturnHistory(fundSide) ? (
                  <FundNotOldEnoughMessage />
                ) : (
                  <ReturnPill v={fundSide?.returnsDirectByHorizon[timeframeYears] ?? null} />
                )}
              </div>
            </td>
          );
        case "returnSinceLaunchDirectBenchmark":
          return (
            <td
              key={col.id}
              className={["num-cell", "w-full", "text-center", "text-[10px]", "sm:text-[11px]", "comparison-fund-cell"]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="flex w-full justify-center">
                <ReturnPill v={fundSide?.returnSinceLaunchDirectBenchmarkPct ?? null} />
              </div>
            </td>
          );
        case "alpha":
          return (
            <td
              key={col.id}
              className={["num-cell", "w-full", "text-center", "text-[10px]", "sm:text-[11px]", "comparison-fund-cell"]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="flex w-full justify-center">
                {fundHasNoReturnHistory(fundSide) ? (
                  <FundNotOldEnoughMessage />
                ) : (
                  <AlphaPill alpha={fundSide?.alphaByHorizon[timeframeYears] ?? null} />
                )}
              </div>
            </td>
          );
        case "infoRatioDirect": {
          const irVal = fundSide?.infoRatioDirectByHorizon[timeframeYears] ?? null;
          const irOk = irVal !== null && irVal !== undefined && Number.isFinite(irVal);
          return (
            <td
              key={col.id}
              className={["num-cell", "text-center", "text-[10px]", "sm:text-[11px]", "comparison-fund-cell"]
                .filter(Boolean)
                .join(" ")}
            >
              {fundHasNoReturnHistory(fundSide) && !irOk ? (
                <FundNotOldEnoughMessage />
              ) : (
                <span className="font-mono tabular-nums leading-relaxed">{format2(irVal)}</span>
              )}
            </td>
          );
        }
        case "ter":
          return (
            <td
              key={col.id}
              className={["num-cell", "text-center", "text-[10px]", "sm:text-[11px]", "comparison-fund-cell"]
                .filter(Boolean)
                .join(" ")}
            >
              <span className="font-mono tabular-nums leading-relaxed">{format2(fundSide?.terDirectPct ?? null)}</span>
            </td>
          );
        case "aum":
          return (
            <td
              key={col.id}
              className={[
                "num-cell",
                "comparison-aum-cell",
                "text-center",
                "text-[10px]",
                "sm:text-[11px]",
                "comparison-fund-cell"
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span className="font-mono tabular-nums leading-relaxed">{format2(fundSide?.aumCr ?? null)}</span>
            </td>
          );
        case "aumChange": {
          if (uiMode === "previous") {
            return (
              <td
                key={col.id}
                className={[
                  "num-cell",
                  "comparison-aum-cell",
                  "text-center",
                  "text-[10px]",
                  "sm:text-[11px]",
                  "comparison-fund-cell"
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className="font-mono tabular-nums text-slate-500">NA</span>
              </td>
            );
          }
          if (uiMode === "both" && col.mode === "previous") {
            return (
              <td
                key={col.id}
                className={["comparison-fund-cell", "text-center", "text-slate-600", "text-[10px]"].filter(Boolean).join(" ")}
              >
                —
              </td>
            );
          }
          const { delta, pct, unmatched } = getAumChangeDisplay(bucketPrevious, bucketLatest, col.schemeKey);
          if (unmatched) {
            return (
              <td
                key={col.id}
                className={[
                  "num-cell", "comparison-aum-cell", "text-center",
                  "text-[10px]", "sm:text-[11px]", "comparison-fund-cell"
                ].join(" ")}
                title="Previous month row not matched — fund may have been renamed or AUM was missing"
              >
                <span className="font-mono tabular-nums text-slate-500">NA</span>
                <span className="ml-1 font-mono text-[9px] text-slate-600">(unmatched)</span>
              </td>
            );
          }
          const pos = delta !== null && Number.isFinite(delta) && delta > 0;
          const neg = delta !== null && Number.isFinite(delta) && delta < 0;
          const pctPos = pct !== null && Number.isFinite(pct) && pct > 0;
          const pctNeg = pct !== null && Number.isFinite(pct) && pct < 0;
          return (
            <td
              key={col.id}
              className={[
                "num-cell",
                "comparison-aum-cell",
                "text-center",
                "text-[10px]",
                "sm:text-[11px]",
                "comparison-fund-cell"
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span
                className={`font-mono tabular-nums leading-relaxed ${
                  delta === null || !Number.isFinite(delta)
                    ? "text-slate-500"
                    : pos
                      ? "text-emerald-400"
                      : neg
                        ? "text-rose-300"
                        : "text-slate-300"
                }`}
              >
                {formatSignedCr(delta)}
              </span>
              <span
                className={`ml-1 font-mono tabular-nums text-[10px] leading-relaxed ${
                  pct === null || !Number.isFinite(pct)
                    ? "text-slate-600"
                    : pctPos
                      ? "text-emerald-400/90"
                      : pctNeg
                        ? "text-rose-300/90"
                        : "text-slate-500"
                }`}
              >
                {formatPctBracket(pct)}
              </span>
            </td>
          );
        }
        default:
          return (
            <td
              key={col.id}
              className={["num-cell", "text-center", "text-[10px]", "sm:text-[11px]", "comparison-fund-cell"]
                .filter(Boolean)
                .join(" ")}
            >
              NA
            </td>
          );
      }
    },
    [bucketPrevious, bucketLatest, columnData, onRibbonToggle, ribbonHiddenKeys, timeframeYears, uiMode]
  );

  if (!selectedSchemeKeys.length) {
    return null;
  }

  return (
    <div className="comparison-table-root min-w-0">
      <div className="comparison-table-toolbar mb-3 flex flex-wrap items-center justify-between gap-3 px-0.5">
        <h2 className="font-terminal text-sm font-semibold tracking-tight text-slate-100">Comparison</h2>
        <div className="flex flex-col items-end gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          {onSelectAll ? (
            <button
              type="button"
              disabled={selectAllDisabled}
              onClick={onSelectAll}
              className="ghost-button !rounded-md px-3 py-1.5 text-[10px] font-terminal font-semibold uppercase tracking-[0.12em] text-slate-300 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              title="Select every fund in the active category (up to the selection cap)"
            >
              {selectAllButtonLabel}
            </button>
          ) : null}
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Horizon</label>
            <select
              className="horizon-select text-[10px] font-mono py-1"
              value={timeframeYears}
              onChange={(e) => onTimeframeChange(e.target.value as ITimeframeYears)}
              disabled={!canCompute}
              title="Global view filter"
            >
              {horizons.map((h) => (
                <option key={h} value={h}>
                  {h}Y
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="w-full text-right text-[10px] text-slate-500 leading-snug max-w-xl ml-auto">
          Horizon controls returns, alpha, information ratio (Direct), and the 5-point score (return vs category, AUM change, TER vs category, alpha, IR Direct {'>'} 1).
        </p>
      </div>

      <div
        ref={scrollRef}
        className="table-wrap comparison-table-scroll border-white/[0.06] overflow-x-auto overflow-y-visible"
      >
        <table
          className="comparison-table comparison-table-polish comparison-table-wide w-max min-w-full border-separate border-spacing-0"
          style={{ tableLayout: "auto" }}
        >
          <thead className="comparison-table-metric-header">
            <tr>
              <th
                className="comparison-sticky-label text-[10px] sm:text-[11px]"
                style={{ width: STICKY_LABEL_COL_PX, minWidth: STICKY_LABEL_COL_PX }}
              >
                Metrics
              </th>
              {columns.map((col) => {
                const data = columnData.get(col.id);
                const pSnap = rankingsPrev?.[timeframeYears]?.get(col.schemeKey);
                const lSnap = rankingsLatest?.[timeframeYears]?.get(col.schemeKey);
                const sc = data?.details?.score;
                const scTotal = data?.details?.total ?? 5;
                const rankable = data?.details?.rankable ?? false;
                const scoreDelta =
                  uiMode === "both" &&
                  col.mode === "latest" &&
                  pSnap != null &&
                  lSnap != null &&
                  (pSnap.rankable ?? false) &&
                  (lSnap.rankable ?? false)
                    ? lSnap.score - pSnap.score
                    : null;
                const showScoreHeader = sc !== undefined && sc !== null;
                const isAnchorCol =
                  uiMode === "both" ? col.mode === "previous" : true;
                return (
                  <th
                    key={col.id}
                    data-scheme-anchor={isAnchorCol ? col.schemeKey : undefined}
                    style={{ minWidth: FUND_COL_MIN_PX, width: FUND_COL_MIN_PX }}
                    className={`comparison-fund-header fund-col text-[10px] sm:text-[11px] relative cursor-pointer ${activeSchemeKey === col.schemeKey ? "is-active" : ""}`}
                    onClick={() => setActiveSchemeKey(col.schemeKey)}
                    title={col.header}
                  >
                    <div className="flex min-w-0 w-full flex-col items-center gap-1.5 text-center">
                      {showScoreHeader ? (
                        <div
                          title={!rankable ? "Partial score — one or more metrics (return, alpha, IR) are unavailable for this fund at the selected horizon" : undefined}
                          className={`inline-flex w-fit max-w-full flex-wrap items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold font-terminal tabular-nums ${
                            rankable
                              ? "border-amber-400/35 bg-amber-950/25 text-amber-200/95"
                              : "border-slate-600/50 bg-slate-800/30 text-slate-400/90"
                          }`}
                        >
                          <span>{`Score ${sc}/${scTotal}`}{!rankable ? <span className="ml-0.5 text-slate-500">*</span> : null}</span>
                          {uiMode === "both" && col.mode === "latest" && scoreDelta !== null && scoreDelta !== 0 ? (
                            <span
                              className={
                                scoreDelta > 0 ? "text-emerald-400" : "text-rose-400"
                              }
                            >
                              {scoreDelta > 0 ? `(↑${scoreDelta})` : `(↓${Math.abs(scoreDelta)})`}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {col.periodShort != null ? (
                        <span className="block w-full text-[9px] font-terminal font-semibold uppercase tracking-[0.18em] text-neutral-400">
                          {col.periodShort}
                        </span>
                      ) : null}
                      <span className="block max-w-full break-words font-semibold text-slate-100 leading-snug" title={col.header}>
                        {col.fundName}
                      </span>
                      {showScoreHeader ? (
                        <button
                          type="button"
                          className="w-fit font-terminal text-[10px] font-medium text-emerald-400/95 hover:text-emerald-300 underline-offset-2 hover:underline"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                            setWhyOpen((prev) =>
                              prev?.schemeKey === col.schemeKey
                                ? null
                                : {
                                    schemeKey: col.schemeKey,
                                    pos: {
                                      top: r.bottom + 6,
                                      left: Math.max(8, Math.min(r.left, window.innerWidth - 540))
                                    }
                                  }
                            );
                          }}
                        >
                          Why?
                        </button>
                      ) : null}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {METRIC_SECTIONS.map((section) => (
              <React.Fragment key={section.title}>
                <tr className="metric-group-row">
                  <th
                    scope="colgroup"
                    className="comparison-sticky-label metric-group-label border-b border-white/[0.06] bg-black/35 py-2 pl-3 pr-2 text-left text-[9px] font-bold uppercase tracking-[0.14em] text-neutral-500"
                    style={{ minWidth: STICKY_LABEL_COL_PX, width: STICKY_LABEL_COL_PX }}
                  >
                    {section.title}
                  </th>
                  {columns.map((col) => (
                    <td
                      key={`${section.title}-${col.id}-banner`}
                      className="metric-group-banner border-b border-white/[0.06] bg-black/35 px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-neutral-500"
                      aria-hidden
                    />
                  ))}
                </tr>
                {section.keys.map((rowKey) => {
                  const def = ROW_DEFS.find((d) => d.key === rowKey);
                  const label = def ? def.label(timeframeYears) : rowKey;
                  return (
                    <tr
                      key={`${section.title}-${rowKey}`}
                      onMouseEnter={() => onMetricRowHover?.(rowKey)}
                      onMouseLeave={() => onMetricRowHover?.(null)}
                      className="comparison-metric-data-row relative z-0"
                      data-metric-key={rowKey}
                    >
                      <th
                        scope="row"
                        className={[
                          "comparison-sticky-label text-[10px] sm:text-[11px]",
                          METRIC_ROW_LABEL_CENTER_KEYS.has(rowKey) ? "comparison-metric-label-center" : ""
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={{ minWidth: STICKY_LABEL_COL_PX, width: STICKY_LABEL_COL_PX }}
                        title={def?.title}
                      >
                        {label}
                      </th>
                      {columns.map((col) => renderMetricCell(rowKey, col))}
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {whyOpen && whyPopoverPayload ? (
        <ScoreWhyLayer
          open
          position={whyOpen.pos}
          onClose={() => setWhyOpen(null)}
          conditions={whyPopoverPayload.dual ? [] : whyPopoverPayload.conditions}
          conditionsPrev={whyPopoverPayload.dual ? whyPopoverPayload.conditionsPrev : undefined}
          conditionsLatest={whyPopoverPayload.dual ? whyPopoverPayload.conditionsLatest : undefined}
          missingInputs={whyPopoverPayload.dual ? undefined : whyPopoverPayload.missingInputs}
          missingInputsPrev={whyPopoverPayload.dual ? whyPopoverPayload.missingInputsPrev : undefined}
          missingInputsLatest={whyPopoverPayload.dual ? whyPopoverPayload.missingInputsLatest : undefined}
          fundName={whyPopoverPayload.fundName}
        />
      ) : null}
    </div>
  );
});
