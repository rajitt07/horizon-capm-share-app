/**
 * Process pipeline (single “Process Analysis” action):
 * 1. Validate inputs (performance + TER per bucket).
 * 2. Parse Performance + TER in parallel for Previous and Latest buckets.
 * 3. Build bucket data, metric warmup, precompute rankings.
 * 4. UI shows dashboard when complete.
 */
import type { IBucketData, IJoinedFund, ITimeframeYears, ISchemeKey, IFundRankingSnapshot } from "./types";
import { joinPerformanceAndTer, buildBucketData } from "./joinBucketData";
import { parsePerformanceFiles } from "./parsers/parsePerformanceFile";
import { parseTerCsv } from "./parsers/parseTerCsv";
import { setAppDiagnostics, setLatestDebugGlobals } from "../appDiagnostics";
import { setMFDebug, setDebugData, type MFDebugPayload, type MFDebugProcessStep } from "../mfDebug";
import { createMetricsEngine } from "./metrics";
import { persistPipelineDebug } from "../debugSession";

const HORIZONS: ITimeframeYears[] = ["1", "3", "5", "10"];

export type BucketProcessInputs = {
  perfFiles: File[];
  terFile: File | null;
  bucketName: string;
};

/** High-level pipeline stage for the Process button label. */
export type ProcessPipelinePhase = "parsing" | "matching";

export type ProcessAnalysisParams = {
  previous: BucketProcessInputs;
  latest: BucketProcessInputs;
  onLog: (message: string) => void;
  onPhase?: (phase: ProcessPipelinePhase) => void;
};

export type ProcessAnalysisResult = {
  prevBucket: IBucketData;
  latestBucket: IBucketData;
  dataInspectorSample: {
    perfRows: unknown[];
  };
};

export class PipelineError extends Error {
  constructor(
    message: string,
    public readonly step: number,
    public readonly stepName: string,
    public readonly detail?: string
  ) {
    super(message);
    this.name = "PipelineError";
    const snap = { message, step, stepName, detail, at: new Date().toISOString() };
    if (typeof window !== "undefined") {
      (window as Window & { __LAST_PIPELINE_ERROR__?: Record<string, unknown> }).__LAST_PIPELINE_ERROR__ = snap;
    }
    persistPipelineDebug(snap);
  }
}

export function validateProcessInputs(prev: BucketProcessInputs, latest: BucketProcessInputs): { ok: true } | { ok: false; message: string } {
  if (!prev.perfFiles.length) {
    return { ok: false, message: "Previous bucket: add at least one Performance file (CSV/XLSX)." };
  }
  if (!latest.perfFiles.length) {
    return { ok: false, message: "Latest bucket: add at least one Performance file (CSV/XLSX)." };
  }
  if (!prev.terFile) {
    return { ok: false, message: "Previous bucket: upload a TER CSV." };
  }
  if (!latest.terFile) {
    return { ok: false, message: "Latest bucket: upload a TER CSV." };
  }
  return { ok: true };
}

async function parseAndJoinBucket(
  label: string,
  inputs: BucketProcessInputs,
  onLog: (m: string) => void
): Promise<{
  joinedFunds: Map<string, IJoinedFund>;
  rawPerfRows: Array<Record<string, unknown>>;
}> {
  const n = inputs.perfFiles.length;
  onLog(`Parsing ${n} performance file(s) + TER (${label})…`);
  const perfResult = await parsePerformanceFiles(inputs.perfFiles);
  const terResult = await parseTerCsv(inputs.terFile!);
  if (perfResult.perfColumnParseMode) {
    onLog(`Performance column map: ${perfResult.perfColumnParseMode === "fixed_template" ? "fixed template" : "legacy fallback"}.`);
  }
  if (terResult.terColumnParseMode) {
    onLog(`TER column map: ${terResult.terColumnParseMode === "fixed_template" ? "fixed template" : "legacy fallback"}.`);
  }
  const { joinedFunds } = joinPerformanceAndTer(
    perfResult.funds,
    terResult.terByKey,
    perfResult.perfSourceBySchemeKey
  );
  onLog(`Joined ${joinedFunds.size} funds (${label}).`);
  const rawPerfRows = (perfResult.rawDebugRows ?? []).map((r) => ({ ...r, _bucket: label }));
  return { joinedFunds, rawPerfRows };
}

function categoryLabelsInBucket(bucket: IBucketData): string[] {
  const s = new Set<string>();
  for (const f of bucket.fundsByKey.values()) {
    if (f.category) s.add(f.category);
  }
  return Array.from(s);
}

function computeRankingsByHorizonForBucket(
  engine: ReturnType<typeof createMetricsEngine>,
  bucketSide: IBucketData,
  bucketPrevious: IBucketData,
  bucketLatest: IBucketData
): Partial<Record<ITimeframeYears, Map<ISchemeKey, IFundRankingSnapshot>>> {
  const out: Partial<Record<ITimeframeYears, Map<ISchemeKey, IFundRankingSnapshot>>> = {};
  for (const h of HORIZONS) {
    const m = new Map<ISchemeKey, IFundRankingSnapshot>();
    for (const schemeKey of bucketSide.fundsByKey.keys()) {
      const fund = bucketSide.fundsByKey.get(schemeKey);
      const cat = fund?.category;
      if (!cat) continue;
      m.set(
        schemeKey,
        engine.computeFundRankingSnapshot({
          bucketSide,
          schemeKey,
          category: cat,
          horizonYears: h,
          bucketPrevious,
          bucketLatest
        })
      );
    }
    out[h] = m;
  }
  return out;
}

async function warmupComputeEngine(prevBucket: IBucketData, latestBucket: IBucketData, onLog: (m: string) => void): Promise<void> {
  onLog("Calculating category averages (parallel buckets)…");
  const enginePrev = createMetricsEngine();
  const engineLatest = createMetricsEngine();
  const catsPrev = categoryLabelsInBucket(prevBucket);
  const catsLatest = categoryLabelsInBucket(latestBucket);

  await Promise.all([
    Promise.resolve().then(() => {
      for (const cat of catsPrev) {
        for (const h of HORIZONS) {
          enginePrev.getCategoryStats(prevBucket, cat, h);
        }
      }
    }),
    Promise.resolve().then(() => {
      for (const cat of catsLatest) {
        for (const h of HORIZONS) {
          engineLatest.getCategoryStats(latestBucket, cat, h);
        }
      }
    })
  ]);

  onLog("Compute pass complete.");
  onLog("Precomputing dual-snapshot rankings (all horizons)…");
  prevBucket.rankingsByHorizon = computeRankingsByHorizonForBucket(enginePrev, prevBucket, prevBucket, latestBucket);
  latestBucket.rankingsByHorizon = computeRankingsByHorizonForBucket(engineLatest, latestBucket, prevBucket, latestBucket);
  onLog("Dual rankings stored (Previous + Latest).");
}

export async function runProcessAnalysis(params: ProcessAnalysisParams): Promise<ProcessAnalysisResult> {
  const { previous, latest, onLog, onPhase } = params;
  const steps: MFDebugProcessStep[] = [];
  setMFDebug(null);
  setDebugData(null);
  setAppDiagnostics(null);
  setLatestDebugGlobals({ perf: null });

  const v = validateProcessInputs(previous, latest);
  if (!v.ok) {
    steps.push({ step: 1, name: "Validate inputs", ok: false, detail: v.message });
    setMFDebug({
      updatedAt: new Date().toISOString(),
      resolvedFetchUrl: "",
      proxyNote: "",
      rawPerformanceData: [],
      rawNavData: [],
      matchLog: [],
      steps
    });
    setDebugData({ raw_perf_rows: [], raw_nav_rows: [], match_count: 0 });
    throw new PipelineError(v.message, 1, "Validate inputs", v.message);
  }
  steps.push({ step: 1, name: "Validate inputs", ok: true });

  onLog("Validating inputs…");
  onLog("OK — performance files and TER present for both buckets.");

  onPhase?.("parsing");
  let prevJoined: Awaited<ReturnType<typeof parseAndJoinBucket>>;
  let latestJoined: Awaited<ReturnType<typeof parseAndJoinBucket>>;
  try {
    [prevJoined, latestJoined] = await Promise.all([
      parseAndJoinBucket("Previous", previous, onLog),
      parseAndJoinBucket("Latest", latest, onLog)
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    steps.push({ step: 2, name: "Parse performance + TER", ok: false, detail: msg });
    setMFDebug({
      updatedAt: new Date().toISOString(),
      resolvedFetchUrl: "",
      proxyNote: "",
      rawPerformanceData: [],
      rawNavData: [],
      matchLog: [],
      steps
    });
    setDebugData({ raw_perf_rows: [], raw_nav_rows: [], match_count: 0 });
    throw new PipelineError(`Step 2: Parse performance + TER failed — ${msg}`, 2, "Parse performance + TER", msg);
  }
  steps.push({
    step: 2,
    name: "Parse performance + TER",
    ok: true,
    detail: `Previous: ${prevJoined.joinedFunds.size} funds, Latest: ${latestJoined.joinedFunds.size} funds`
  });

  const prevBucket = buildBucketData({
    bucketName: previous.bucketName,
    joinedFunds: prevJoined.joinedFunds
  });
  const latestBucket = buildBucketData({
    bucketName: latest.bucketName,
    joinedFunds: latestJoined.joinedFunds
  });

  onPhase?.("matching");
  try {
    await warmupComputeEngine(prevBucket, latestBucket, onLog);
    steps.push({ step: 3, name: "Metric warmup (category averages, rankings)", ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    steps.push({ step: 3, name: "Metric warmup", ok: false, detail: msg });
    throw e;
  }

  const rawPerformanceData = [...prevJoined.rawPerfRows, ...latestJoined.rawPerfRows];

  setMFDebug({
    updatedAt: new Date().toISOString(),
    resolvedFetchUrl: "",
    proxyNote: "",
    rawPerformanceData,
    rawNavData: [],
    matchLog: [],
    steps
  });
  setDebugData({
    raw_perf_rows: rawPerformanceData,
    raw_nav_rows: [],
    match_count: 0
  });

  const totalFunds = prevJoined.joinedFunds.size + latestJoined.joinedFunds.size;
  setAppDiagnostics({
    updatedAt: new Date().toISOString(),
    performance_sample: rawPerformanceData.slice(0, 5),
    total_funds: totalFunds
  });
  setLatestDebugGlobals({
    perf: {
      previousSample: prevJoined.rawPerfRows.slice(0, 50),
      latestSample: latestJoined.rawPerfRows.slice(0, 50)
    }
  });

  const perfSample = [...prevJoined.rawPerfRows, ...latestJoined.rawPerfRows].slice(0, 5);

  return {
    prevBucket,
    latestBucket,
    dataInspectorSample: {
      perfRows: perfSample
    }
  };
}
