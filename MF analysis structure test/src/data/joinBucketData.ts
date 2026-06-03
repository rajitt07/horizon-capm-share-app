import type { IBucketData, IJoinedFund, IPerformance, ITer, ISchemeKey, ITimeframeYears } from "./types";
import { generateUniversalKey } from "./utils";

const horizons: ITimeframeYears[] = ["1", "3", "5", "10"];

function computeAlpha(direct: number | null | undefined, bench: number | null | undefined): number | null {
  if (direct === null || direct === undefined) return null;
  if (bench === null || bench === undefined) return null;
  if (!Number.isFinite(direct) || !Number.isFinite(bench)) return null;
  return direct - bench;
}

export function joinPerformanceAndTer(
  performanceByKey: Map<string, IPerformance>,
  terByKey: Map<string, ITer>,
  perfSourceBySchemeKey?: Map<ISchemeKey, string>
): { joinedFunds: Map<ISchemeKey, IJoinedFund>; schemeKeysToKeep: Set<string> } {
  const joinedFunds = new Map<ISchemeKey, IJoinedFund>();

  for (const [schemeKey, perf] of performanceByKey.entries()) {
    // Primary lookup: by exact scheme key (code-based or name-based depending on parser).
    // Fallback: by name-key — covers the case where TER uses fixed-template (name keys)
    // but performance was keyed by scheme code.
    const nameKey = generateUniversalKey(perf.schemeName);
    const ter = terByKey.get(schemeKey) ?? (schemeKey !== nameKey ? terByKey.get(nameKey) : undefined);
    const perfSourceFileLabel = perfSourceBySchemeKey?.get(schemeKey) ?? null;
    const returnsDirectByHorizon: Record<ITimeframeYears, number | null> = { "1": null, "3": null, "5": null, "10": null };
    const returnsBenchmarkByHorizon: Record<ITimeframeYears, number | null> = { "1": null, "3": null, "5": null, "10": null };
    const alphaByHorizon: Record<ITimeframeYears, number | null> = { "1": null, "3": null, "5": null, "10": null };
    const infoRatioDirectByHorizon: Record<ITimeframeYears, number | null> = { "1": null, "3": null, "5": null, "10": null };

    for (const h of horizons) {
      const d = perf.returnsDirectByHorizon[h] ?? null;
      const b = perf.returnsBenchmarkByHorizon[h] ?? null;
      returnsDirectByHorizon[h] = d;
      returnsBenchmarkByHorizon[h] = b;
      alphaByHorizon[h] = computeAlpha(d, b);
      const ir = perf.infoRatioDirectByHorizon?.[h];
      infoRatioDirectByHorizon[h] = ir !== null && ir !== undefined && Number.isFinite(ir) ? ir : null;
    }

    joinedFunds.set(schemeKey, {
      schemeKey,
      schemeName: perf.schemeName,
      schemeCode: perf.schemeCode ?? null,
      category: perf.category ?? null,
      benchmarkName: perf.benchmarkName ?? null,
      returnsDirectByHorizon,
      returnsBenchmarkByHorizon,
      alphaByHorizon,
      terDirectPct: ter?.terDirectPct ?? null,
      aumCr: perf.aumCr ?? null,
      infoRatioDirectByHorizon,
      returnSinceLaunchDirectBenchmarkPct: perf.returnSinceLaunchDirectBenchmarkPct ?? null,
      perfSourceFileLabel,
      navStdDevRebasedByHorizon: {}
    });
  }

  return { joinedFunds, schemeKeysToKeep: new Set(joinedFunds.keys()) };
}

export function buildBucketData(params: { bucketName: string; joinedFunds: Map<ISchemeKey, IJoinedFund> }): IBucketData {
  return {
    name: params.bucketName,
    fundsByKey: params.joinedFunds,
    horizons,
    status: { stage: "ready", files: { performance: true, ter: true } }
  };
}
