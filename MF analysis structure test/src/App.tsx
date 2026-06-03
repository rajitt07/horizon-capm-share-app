import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { IBucketData, IJoinedFund, ITimeframeYears, IUiMode } from "./data/types";
import { runProcessAnalysis, type ProcessPipelinePhase } from "./data/processAnalysis";
import { formatProcessFailure, type ProcessFailure } from "./processFailure";
import { createMetricsEngine } from "./data/metrics";
import BucketUploader from "./components/BucketUploader";
import { ComparisonTable, type ComparisonTableHandle } from "./components/ComparisonTable";
import { ControlsBar } from "./components/ControlsBar";
import { AnalysisEmptyState } from "./components/AnalysisEmptyState";
import { WaitingForDataState } from "./components/WaitingForDataState";
import { ProcessLoadingOverlay } from "./components/ProcessLoadingOverlay";
import { CategorySummaryBar } from "./components/CategorySummaryBar";
import { ComparisonMetricRibbon } from "./components/ComparisonMetricRibbon";
import { LeaderboardPanel } from "./components/LeaderboardPanel";
import { AlphaHorizonChart } from "./components/AlphaHorizonChart";
import { clearAllDebugSession } from "./debugSession";
import { MAX_SELECTABLE_FUNDS, MAX_SELECTABLE_FUNDS_BOTH_MODE } from "./config/uiLimits";
import { compareByScoreReturnAlphaWithRankable } from "./data/peerSuggestions";
import CreditForecastTab from "./components/CreditForecastTab";
import { getSubCategoriesForParent } from "./utils/parentCategories";

const emptyBucket: IBucketData = {
  name: "",
  fundsByKey: new Map(),
  horizons: ["1", "3", "5", "10"],
  status: { stage: "idle" }
};

function formatProcessedAt(d: Date): string {
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export default function App() {
  const [prevBucket, setPrevBucket] = useState<IBucketData>({ ...emptyBucket, name: "Previous Month" });
  const [latestBucket, setLatestBucket] = useState<IBucketData>({ ...emptyBucket, name: "Latest" });

  const [prevPerfFiles, setPrevPerfFiles] = useState<File[]>([]);
  const [prevTerFile, setPrevTerFile] = useState<File | null>(null);

  const [latestPerfFiles, setLatestPerfFiles] = useState<File[]>([]);
  const [latestTerFile, setLatestTerFile] = useState<File | null>(null);

  const [isProcessed, setIsProcessed] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processLog, setProcessLog] = useState<string[]>([]);
  const [processFailure, setProcessFailure] = useState<ProcessFailure | null>(null);
  const [lastProcessed, setLastProcessed] = useState<Date | null>(null);
  const [processPhase, setProcessPhase] = useState<ProcessPipelinePhase | "idle">("idle");

  const [uiMode, setUiMode] = useState<IUiMode>("both");
  const [timeframe, setTimeframe] = useState<ITimeframeYears>("1");
  /**
   * Category filter: scopes the pick-list (when set), leaderboard, category summary bar, and
   * "Select all in category". Changing category does not remove already-selected funds (see ControlsBar validSchemeKeys).
   */
  const [selectedParentCategory, setSelectedParentCategory] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedSchemeKeys, setSelectedSchemeKeys] = useState<string[]>([]);
  const [activeSchemeKey, setActiveSchemeKey] = useState<string>("");
  const [rankMode, setRankMode] = useState<boolean>(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [ribbonHiddenKeys, setRibbonHiddenKeys] = useState<Set<string>>(new Set());
  const [schemeSearchQuery, setSchemeSearchQuery] = useState("");
  const [copiedDebugBundle, setCopiedDebugBundle] = useState(false);
  /** Bumping remounts ControlsBar so peer/compare local state resets with Clear. */
  const [controlsBarMountKey, setControlsBarMountKey] = useState(0);
  const [activeTab, setActiveTab] = useState<"analysis" | "credit-forecast">("analysis");

  const processLockRef = useRef(false);

  const activeBucket = uiMode === "previous" ? prevBucket : latestBucket;

  const metricsEngine = useMemo(() => createMetricsEngine(), []);

  const dualRankings = useMemo(
    () => ({
      prev: prevBucket.rankingsByHorizon,
      latest: latestBucket.rankingsByHorizon
    }),
    [prevBucket, latestBucket]
  );

  const comparisonTableRef = useRef<ComparisonTableHandle | null>(null);

  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    // In "both" mode union categories from both buckets so prev-only categories are visible.
    const buckets = uiMode === "both" ? [prevBucket, latestBucket] : [activeBucket];
    for (const bucket of buckets) {
      for (const fund of bucket.fundsByKey.values()) {
        if (fund.category) cats.add(fund.category.trim());
      }
    }
    return Array.from(cats).sort((a, b) => a.localeCompare(b));
  }, [activeBucket, uiMode, prevBucket, latestBucket]);

  /**
   * All funds visible to the picker — in "both" mode this is the union of prev + latest
   * so funds that exist only in the previous month are still selectable.
   */
  const allFundsInActiveBucket = useMemo(() => {
    if (uiMode !== "both") {
      const rows: IJoinedFund[] = [];
      for (const fund of activeBucket.fundsByKey.values()) rows.push(fund);
      return rows.sort((a, b) => a.schemeName.localeCompare(b.schemeName));
    }
    // Union: prefer latest entry when a key exists in both (latest has fresher data).
    const byKey = new Map<string, IJoinedFund>();
    for (const fund of prevBucket.fundsByKey.values()) byKey.set(fund.schemeKey, fund);
    for (const fund of latestBucket.fundsByKey.values()) byKey.set(fund.schemeKey, fund);
    return Array.from(byKey.values()).sort((a, b) => a.schemeName.localeCompare(b.schemeName));
  }, [activeBucket, uiMode, prevBucket, latestBucket]);

  /**
   * Valid scheme keys = union of both buckets — a fund present only in Previous
   * should not be pruned from selection when in "both" mode.
   */
  const validSchemeKeysInActiveBucket = useMemo(() => {
    if (uiMode !== "both") return new Set<string>(activeBucket.fundsByKey.keys());
    const keys = new Set<string>();
    for (const k of prevBucket.fundsByKey.keys()) keys.add(k);
    for (const k of latestBucket.fundsByKey.keys()) keys.add(k);
    return keys;
  }, [activeBucket, uiMode, prevBucket, latestBucket]);

  /**
   * Active subcategory filter: when a parent is set but no explicit subcategory, use ALL
   * subcategories under that parent as the filter set; otherwise use the single selectedCategory.
   */
  const effectiveSubCategories = useMemo((): string[] | null => {
    if (selectedCategory) return [selectedCategory];
    if (selectedParentCategory) {
      const subs = getSubCategoriesForParent(selectedParentCategory);
      if (subs) return subs;
      // Standalone acting as parent: the label itself IS the subcategory.
      return [selectedParentCategory];
    }
    return null; // no filter — show all
  }, [selectedParentCategory, selectedCategory]);

  /**
   * Category-filtered list for empty-state copy (e.g. no funds in category). Scheme search uses the full bucket via
   * `universeFundsForChips` in ControlsBar.
   */
  const fundsForPicker = useMemo(() => {
    if (!effectiveSubCategories) return allFundsInActiveBucket;
    return allFundsInActiveBucket.filter((f) =>
      effectiveSubCategories.includes(f.category?.trim() ?? "")
    );
  }, [allFundsInActiveBucket, effectiveSubCategories]);

  /**
   * Scope for "Select all in category" only: when a category is chosen, select every fund in that category
   * (up to max); when "All Categories", select every fund in the bucket. Does not remove existing
   * cross-category picks — user can add more from the full list afterward.
   */
  const fundsForSelectAllScope = useMemo(() => {
    if (!effectiveSubCategories) return allFundsInActiveBucket;
    return allFundsInActiveBucket.filter((f) =>
      effectiveSubCategories.includes(f.category?.trim() ?? "")
    );
  }, [allFundsInActiveBucket, effectiveSubCategories]);

  const canCompute = isProcessed && prevBucket.fundsByKey.size > 0 && latestBucket.fundsByKey.size > 0;

  const showTableBlock = selectedSchemeKeys.length > 0;

  useEffect(() => {
    setRibbonHiddenKeys((prev) => {
      const sel = new Set(selectedSchemeKeys);
      return new Set([...prev].filter((k) => sel.has(k)));
    });
  }, [selectedSchemeKeys]);

  const ribbonOrderKeys = useMemo(() => {
    if (!rankMode) return selectedSchemeKeys;
    const sideBucket = uiMode === "previous" ? prevBucket : latestBucket;
    const rankMap = uiMode === "previous" ? dualRankings.prev?.[timeframe] : dualRankings.latest?.[timeframe];
    if (rankMap && rankMap.size > 0) {
      const scored: Array<{ k: string; score: number; name: string; fund: IJoinedFund; rankable: boolean }> = [];
      for (const k of selectedSchemeKeys) {
        const fund = sideBucket.fundsByKey.get(k);
        if (!fund) continue;
        const cat = fund.category?.trim() ?? "";
        if (!cat) continue;
        const snap = rankMap.get(k);
        if (!snap) continue;
        scored.push({ k, score: snap.score, name: fund.schemeName, fund, rankable: snap.rankable ?? false });
      }
      scored.sort((a, b) =>
        compareByScoreReturnAlphaWithRankable(a.score, a.fund, a.rankable, b.score, b.fund, b.rankable, timeframe)
      );
      const order = new Set(scored.map((s) => s.k));
      const tail = selectedSchemeKeys.filter((k) => !order.has(k));
      return scored.map((s) => s.k).concat(tail);
    }
    const scored: Array<{ k: string; score: number; name: string; fund: IJoinedFund; rankable: boolean }> = [];
    for (const k of selectedSchemeKeys) {
      const fund = sideBucket.fundsByKey.get(k);
      if (!fund) continue;
      const cat = fund.category?.trim() ?? "";
      if (!cat) continue;
      const details = metricsEngine.computeScoreDetails({
        bucketSide: sideBucket,
        schemeKey: k,
        category: cat,
        horizonYears: timeframe,
        bucketPrevious: prevBucket,
        bucketLatest: latestBucket
      });
      scored.push({ k, score: details.score, name: fund.schemeName, fund, rankable: details.rankable });
    }
    scored.sort((a, b) =>
      compareByScoreReturnAlphaWithRankable(a.score, a.fund, a.rankable, b.score, b.fund, b.rankable, timeframe)
    );
    const order = new Set(scored.map((s) => s.k));
    const tail = selectedSchemeKeys.filter((k) => !order.has(k));
    return scored.map((s) => s.k).concat(tail);
  }, [rankMode, selectedSchemeKeys, uiMode, prevBucket, latestBucket, timeframe, metricsEngine, dualRankings]);

  const onRibbonToggle = useCallback((schemeKey: string) => {
    setRibbonHiddenKeys((prev) => {
      const n = new Set(prev);
      if (n.has(schemeKey)) n.delete(schemeKey);
      else n.add(schemeKey);
      return n;
    });
  }, []);

  const effectiveMaxSelected = uiMode === "both" ? MAX_SELECTABLE_FUNDS_BOTH_MODE : MAX_SELECTABLE_FUNDS;

  const handleSelectAllSchemes = useCallback(() => {
    const keys = fundsForSelectAllScope.map((f) => f.schemeKey).slice(0, effectiveMaxSelected);
    setSelectedSchemeKeys(keys);
    setActiveSchemeKey(keys[0] ?? "");
  }, [fundsForSelectAllScope, effectiveMaxSelected]);

  const handleRibbonActivate = useCallback((schemeKey: string) => {
    setActiveSchemeKey(schemeKey);
    comparisonTableRef.current?.scrollToScheme(schemeKey);
  }, []);

  const handleClearSelections = useCallback(() => {
    setSelectedSchemeKeys([]);
    setActiveSchemeKey("");
    setSelectedCategory("");
    setSchemeSearchQuery("");
    setRankMode(false);
    setLeaderboardOpen(false);
    setRibbonHiddenKeys(new Set());
    setControlsBarMountKey((k) => k + 1);
  }, []);

  const debugClipboardBundle = useMemo(() => {
    const parts: string[] = [processFailure?.technicalDetail ? `Failure detail:\n${processFailure.technicalDetail}` : ""];
    if (typeof window !== "undefined" && window.MF_DEBUG) {
      try {
        parts.push(`MF_DEBUG.steps:\n${JSON.stringify(window.MF_DEBUG.steps, null, 2)}`);
      } catch {
        parts.push("MF_DEBUG: [could not stringify]");
      }
    }
    return parts.filter(Boolean).join("\n\n---\n\n");
  }, [processFailure?.technicalDetail]);

  const handleProcess = useCallback(async () => {
    if (processLockRef.current) return;
    processLockRef.current = true;
    setProcessFailure(null);
    if (typeof window !== "undefined") {
      const w = window as Window & { __LAST_PIPELINE_ERROR__?: unknown };
      w.__LAST_PIPELINE_ERROR__ = undefined;
    }
    setProcessing(true);
    const lines: string[] = ["Cleaning & mapping data…"];
    setProcessLog([...lines]);
    const onLog = (m: string) => {
      lines.push(m);
      setProcessLog([...lines]);
    };
    try {
      const { prevBucket: p, latestBucket: l, dataInspectorSample } = await runProcessAnalysis({
        previous: {
          perfFiles: prevPerfFiles,
          terFile: prevTerFile,
          bucketName: "Previous Month"
        },
        latest: {
          perfFiles: latestPerfFiles,
          terFile: latestTerFile,
          bucketName: "Latest"
        },
        onLog,
        onPhase: setProcessPhase
      });
      setPrevBucket(p);
      setLatestBucket(l);
      setIsProcessed(true);
      setLastProcessed(new Date());
      console.log("Performance Data Sample:", dataInspectorSample.perfRows);
      setSelectedSchemeKeys([]);
      setActiveSchemeKey("");
      setSelectedCategory("");
      setSchemeSearchQuery("");
      setRibbonHiddenKeys(new Set());
      clearAllDebugSession();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setProcessFailure(formatProcessFailure(e));
      onLog(`Error: ${msg}`);
      // Keep isProcessed true if we already have a valid prior run so the
      // dashboard stays visible. Only go to waiting-state on the very first run.
      if (prevBucket.fundsByKey.size === 0 && latestBucket.fundsByKey.size === 0) {
        setIsProcessed(false);
      }
    } finally {
      processLockRef.current = false;
      setProcessing(false);
      setProcessPhase("idle");
    }
  }, [prevPerfFiles, prevTerFile, latestPerfFiles, latestTerFile]);

  const mainWorkspace = !isProcessed && !processing;

  return (
    <div className="min-h-screen bg-black text-neutral-100 flex flex-col font-sans">
      <header className="shrink-0 border-b border-white/[0.06] bg-black/90 px-6 py-4 shadow-[inset_0_-1px_0_rgba(255,255,255,0.04)] backdrop-blur-md">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white font-terminal">Mutual Fund Terminal</h1>
            <p className="mt-1 text-xs text-neutral-500 max-w-2xl leading-relaxed">
              Upload performance and TER files for Previous and Latest, then run Process Analysis to parse, join, and compute
              metrics.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            {/* Tab switcher */}
            <div className="flex items-center rounded-full border border-white/[0.1] bg-white/[0.03] p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab("analysis")}
                className={`rounded-full px-3 py-1 font-terminal text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                  activeTab === "analysis"
                    ? "bg-white/[0.1] text-white"
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                Analysis
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("credit-forecast")}
                className={`rounded-full px-3 py-1 font-terminal text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                  activeTab === "credit-forecast"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                Credit Forecast
              </button>
            </div>
            {isProcessed && lastProcessed ? (
              <div className="text-[11px] text-accent-pos font-medium font-mono tabular-nums">Ready</div>
            ) : null}
            {isProcessed ? (
              <button
                type="button"
                onClick={handleClearSelections}
                className="rounded border border-white/[0.14] bg-white/[0.04] px-3 py-1.5 font-terminal text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-300 transition-colors hover:border-amber-200/40 hover:bg-amber-500/10 hover:text-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <section
        className="shrink-0 border-b border-white/[0.06] bg-black/80 px-4 py-4 backdrop-blur-md sm:px-6"
        aria-label="Upload performance and TER files, then run process"
      >
        <div className="mx-auto max-w-[1600px]">
          <div className="mb-3 font-terminal text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            Data uploads
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
            <div className="rounded-xl border border-white/[0.08] bg-black/50 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="mb-2 font-terminal text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                Previous Month
              </div>
              <BucketUploader
                bucketName="Previous Month"
                embedded
                perfFiles={prevPerfFiles}
                onPerfFilesChange={setPrevPerfFiles}
                terFile={prevTerFile}
                onTerFileChange={setPrevTerFile}
              />
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-black/50 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="mb-2 font-terminal text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                Latest Month
              </div>
              <BucketUploader
                bucketName="Latest"
                embedded
                perfFiles={latestPerfFiles}
                onPerfFilesChange={setLatestPerfFiles}
                terFile={latestTerFile}
                onTerFileChange={setLatestTerFile}
              />
            </div>
          </div>

          <div className="mt-5 space-y-3 border-t border-white/[0.08] pt-4">
            {processFailure ? (
              <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-br from-neutral-950/95 via-black to-neutral-950/95 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.5)] ring-1 ring-white/5 backdrop-blur-md">
                <div className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-rose-500/10 blur-2xl" aria-hidden />
                <div className="relative flex items-start gap-2">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-500/25 bg-rose-950/40 text-lg" aria-hidden>
                    ⚠
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-300/90">Pipeline</div>
                    <div className="text-xs font-semibold text-slate-100 leading-snug">{processFailure.title}</div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{processFailure.summary}</p>
                    {processFailure.hints.length > 0 ? (
                      <ul className="list-disc space-y-1 pl-4 text-[10px] text-slate-500">
                        {processFailure.hints.map((h, i) => (
                          <li key={`${i}-${h.slice(0, 40)}`}>{h}</li>
                        ))}
                      </ul>
                    ) : null}
                    {processFailure.technicalDetail ? (
                      <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded-md border border-slate-800/80 bg-black/30 p-2 font-mono text-[9px] text-slate-400">
                        {processFailure.technicalDetail}
                      </pre>
                    ) : null}
                    {typeof window !== "undefined" && window.MF_DEBUG?.steps?.length ? (
                      <ul className="list-none space-y-1 rounded-md border border-slate-800/60 bg-black/20 p-2 font-mono text-[9px] text-slate-500">
                        {window.MF_DEBUG.steps.map((s) => (
                          <li key={`${s.step}-${s.name}`}>
                            <span className="text-slate-600">{s.step}.</span> {s.name}{" "}
                            <span className={s.ok ? "text-emerald-500/90" : "text-rose-400"}>{s.ok ? "OK" : "FAIL"}</span>
                            {s.detail ? <span className="text-slate-600"> — {s.detail}</span> : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-black/60 px-2.5 py-1.5 text-[10px] font-medium text-neutral-200 hover:border-emerald-500/40 hover:bg-neutral-950/90"
                        onClick={() => {
                          void navigator.clipboard.writeText(debugClipboardBundle).then(() => {
                            setCopiedDebugBundle(true);
                            window.setTimeout(() => setCopiedDebugBundle(false), 2200);
                          });
                        }}
                      >
                        {copiedDebugBundle ? "Copied" : "Copy debug bundle"}
                      </button>
                      <span className="self-center text-[9px] text-slate-600">Includes error detail + MF_DEBUG steps</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="flex w-full max-w-xl items-stretch gap-2">
              <button
                type="button"
                className={`cyber-process-btn min-h-[44px] min-w-0 flex-1 ${processing ? "opacity-90" : ""}`}
                disabled={processing}
                onClick={() => void handleProcess()}
              >
                {processing ? (
                  <span className="inline-flex items-center justify-center gap-2 font-mono text-[10px] tracking-[0.15em]">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-accent-pos shadow-[0_0_12px_rgba(74,222,128,0.5)]" />
                    {processPhase === "parsing" ? "PARSING…" : processPhase === "matching" ? "MATCHING…" : "PROCESSING"}
                  </span>
                ) : (
                  <span className="font-mono text-xs tracking-[0.18em]">PROCESS ANALYSIS</span>
                )}
              </button>
            </div>
            {lastProcessed ? (
              <div className="text-[10px] text-slate-600 font-mono tabular-nums">
                Last run <span className="text-slate-400">{formatProcessedAt(lastProcessed)}</span>
              </div>
            ) : (
              <div className="text-[10px] text-slate-700 font-mono">Awaiting first run</div>
            )}
          </div>
        </div>
      </section>

      {/* Main workspace: metrics → dashboard (uploads + process live in the strip above). */}
      <div className={`flex min-w-0 flex-col ${activeTab === "credit-forecast" ? "flex-1 overflow-hidden" : "min-h-0 flex-1"}`}>
        <main className={`relative flex min-h-0 min-w-0 flex-1 flex-col bg-black ${activeTab === "credit-forecast" ? "overflow-y-auto" : "overflow-hidden"}`}>
          {activeTab === "credit-forecast" ? (
            <CreditForecastTab />
          ) : (
          <>
          {processing ? <ProcessLoadingOverlay lines={processLog} active={processing} /> : null}

          <div className={`flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5 lg:p-6 ${mainWorkspace ? "items-stretch" : ""}`}>
            {mainWorkspace ? (
              <WaitingForDataState />
            ) : !processing && isProcessed ? (
              <AnimatePresence mode="wait">
                <motion.div
                  key="analysis"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex min-h-0 flex-1 flex-col gap-5"
                >
                    <ControlsBar
                      key={controlsBarMountKey}
                      uiMode={uiMode}
                      onUiModeChange={setUiMode}
                      categories={allCategories}
                      selectedParentCategory={selectedParentCategory}
                      onParentCategoryChange={(p) => {
                        setSelectedParentCategory(p);
                        setSelectedCategory(""); // clear sub-category when parent changes
                      }}
                      selectedCategory={selectedCategory}
                      onCategoryChange={setSelectedCategory}
                      funds={fundsForPicker}
                      validSchemeKeysInBucket={validSchemeKeysInActiveBucket}
                      universeFundsForChips={allFundsInActiveBucket}
                      schemeSearchQuery={schemeSearchQuery}
                      onSchemeSearchQueryChange={setSchemeSearchQuery}
                      selectedSchemeKeys={selectedSchemeKeys}
                      setSelectedSchemeKeys={setSelectedSchemeKeys}
                      activeSchemeKey={activeSchemeKey}
                      setActiveSchemeKey={setActiveSchemeKey}
                      rankMode={rankMode}
                      onRankModeChange={setRankMode}
                      onOpenLeaderboard={() => setLeaderboardOpen(true)}
                      maxSelected={effectiveMaxSelected}
                      canCompute={canCompute}
                      timeframeYears={timeframe}
                      bucketSide={activeBucket}
                      bucketPrevious={prevBucket}
                      bucketLatest={latestBucket}
                      engine={metricsEngine}
                      rankingsForHorizon={
                        uiMode === "previous" ? dualRankings.prev?.[timeframe] : dualRankings.latest?.[timeframe]
                      }
                    />

                    <section className="analytics-card min-h-[200px] flex flex-col p-0 overflow-visible">
                      <div className="comparison-scroll flex flex-col">
                        <div>
                          <CategorySummaryBar
                            selectedCategory={selectedCategory}
                            selectedSchemeKeys={selectedSchemeKeys}
                            timeframeYears={timeframe}
                            uiMode={uiMode}
                            prevBucket={prevBucket}
                            latestBucket={latestBucket}
                            prevPerfFiles={prevPerfFiles}
                            latestPerfFiles={latestPerfFiles}
                            engine={metricsEngine}
                          />
                          <ComparisonMetricRibbon
                            uiMode={uiMode}
                            bucketPrevious={prevBucket}
                            bucketLatest={latestBucket}
                            schemeKeysOrdered={ribbonOrderKeys}
                            ribbonHiddenKeys={ribbonHiddenKeys}
                            timeframeYears={timeframe}
                            activeSchemeKey={activeSchemeKey}
                            onSetActive={handleRibbonActivate}
                            onRemoveFromSelection={(k) => {
                              setSelectedSchemeKeys((prev) => prev.filter((x) => x !== k));
                              setActiveSchemeKey((a) => (a === k ? "" : a));
                            }}
                          />
                        </div>
                        {showTableBlock ? (
                          <div className="min-h-0 flex-1 px-4 pb-4 pt-0 lg:px-6">
                            <ComparisonTable
                              ref={comparisonTableRef}
                              bucketPrevious={prevBucket}
                              bucketLatest={latestBucket}
                              uiMode={uiMode}
                              timeframeYears={timeframe}
                              onTimeframeChange={setTimeframe}
                              canCompute={canCompute}
                              selectedCategory={selectedCategory}
                              selectedSchemeKeys={selectedSchemeKeys}
                              activeSchemeKey={activeSchemeKey}
                              setActiveSchemeKey={setActiveSchemeKey}
                              rankMode={rankMode}
                              ribbonHiddenKeys={ribbonHiddenKeys}
                              onRibbonToggle={onRibbonToggle}
                              rankingsPrev={dualRankings.prev}
                              rankingsLatest={dualRankings.latest}
                              onSelectAll={handleSelectAllSchemes}
                              selectAllDisabled={!canCompute || !fundsForSelectAllScope.length}
                              selectAllButtonLabel={
                                selectedCategory ? "Select all in this sub-category" : selectedParentCategory ? "Select all in this sector" : "Select all funds (up to cap)"
                              }
                            />
                          </div>
                        ) : (
                          <div className="px-4 pb-4 pt-2 lg:px-6">
                            <AnalysisEmptyState />
                          </div>
                        )}
                      </div>
                    </section>

                    <section className="analytics-card flex flex-col gap-2">
                      <div className="font-terminal text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                        Alpha by horizon
                      </div>
                      {uiMode === "both" ? (
                        <div className="flex flex-col gap-6">
                          <AlphaHorizonChart
                            bucket={prevBucket}
                            selectedSchemeKeys={selectedSchemeKeys}
                            datasetLabel="Previous month"
                          />
                          <div className="border-t border-white/[0.06] pt-6">
                            <AlphaHorizonChart
                              bucket={latestBucket}
                              selectedSchemeKeys={selectedSchemeKeys}
                              datasetLabel="Latest month"
                            />
                          </div>
                        </div>
                      ) : (
                        <AlphaHorizonChart
                          bucket={uiMode === "previous" ? prevBucket : latestBucket}
                          selectedSchemeKeys={selectedSchemeKeys}
                        />
                      )}
                    </section>
                  </motion.div>
              </AnimatePresence>
            ) : null}

            {/* Leaderboard: when selectedCategory is set, only lists funds in that category (existing behavior). */}
            <LeaderboardPanel
              open={leaderboardOpen && isProcessed}
              onClose={() => setLeaderboardOpen(false)}
              bucketSide={activeBucket}
              bucketPrevious={prevBucket}
              bucketLatest={latestBucket}
              selectedCategory={selectedCategory}
              effectiveSubCategories={effectiveSubCategories}
              timeframeYears={timeframe}
              engine={metricsEngine}
            />
          </div>
          </>
          )}
        </main>
      </div>
    </div>
  );
}
