import type {
  IBucketData,
  ICategoryStats,
  IJoinedFund,
  ITimeframeYears,
  ISchemeKey,
  IScoreCondition,
  IFundRankingSnapshot
} from "./types";
import { resolveCrossBucketAum } from "./crossBucketAum";
import { agg, from as aqFrom, op } from "arquero";

export function createMetricsEngine() {
  const categoryStatsMemo = new WeakMap<IBucketData, Map<string, ICategoryStats>>();

  function getCategoryStats(bucket: IBucketData, category: string, horizonYears: ITimeframeYears): ICategoryStats {
    const memoForBucket = categoryStatsMemo.get(bucket) ?? new Map<string, ICategoryStats>();
    categoryStatsMemo.set(bucket, memoForBucket);
    const cacheKey = `${category}__${horizonYears}`;
    const cached = memoForBucket.get(cacheKey);
    if (cached) return cached;

    const peers: IJoinedFund[] = [];
    for (const fund of bucket.fundsByKey.values()) {
      if (fund.category === category) peers.push(fund);
    }

    if (peers.length <= 1) {
      const empty: ICategoryStats = {
        avgReturnDirect: null,
        avgTER: null,
        avgAlpha: null,
        avgInfoRatioDirect: null
      };
      memoForBucket.set(cacheKey, empty);
      return empty;
    }

    const statsRows = peers.map((p) => ({
      ret: p.returnsDirectByHorizon[horizonYears] ?? null,
      ter: p.terDirectPct ?? null,
      alpha: p.alphaByHorizon[horizonYears] ?? null
    }));

    const t = aqFrom(statsRows);
    const avgReturnDirectRaw = agg(t, op.mean("ret")) as any;
    const avgTERRaw = agg(t, op.mean("ter")) as any;
    const avgAlphaRaw = agg(t, op.mean("alpha")) as any;

    const avgReturnDirect =
      avgReturnDirectRaw === null || avgReturnDirectRaw === undefined
        ? null
        : Number.isFinite(avgReturnDirectRaw)
          ? avgReturnDirectRaw
          : null;
    const avgTER = avgTERRaw === null || avgTERRaw === undefined ? null : Number.isFinite(avgTERRaw) ? avgTERRaw : null;
    const avgAlpha = avgAlphaRaw === null || avgAlphaRaw === undefined ? null : Number.isFinite(avgAlphaRaw) ? avgAlphaRaw : null;

    const irVals = peers
      .map((p) => p.infoRatioDirectByHorizon[horizonYears])
      .filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));
    const avgInfoRatioDirect = irVals.length === 0 ? null : irVals.reduce((a, b) => a + b, 0) / irVals.length;

    const stats: ICategoryStats = {
      avgReturnDirect,
      avgTER,
      avgAlpha,
      avgInfoRatioDirect
    };
    memoForBucket.set(cacheKey, stats);
    return stats;
  }

  function computeScoreDetails(params: {
    bucketSide: IBucketData;
    schemeKey: ISchemeKey;
    category: string;
    horizonYears: ITimeframeYears;
    bucketPrevious: IBucketData;
    bucketLatest: IBucketData;
  }) {
    const { bucketSide, schemeKey, category, horizonYears, bucketPrevious, bucketLatest } = params;

    const fundSide = bucketSide.fundsByKey.get(schemeKey);
    if (!fundSide) {
      return {
        score: 0,
        total: 5,
        reasons: ["missing_fund: 0/5"],
        conditions: [] as IScoreCondition[],
        rankable: false
      };
    }

    const catStats = getCategoryStats(bucketSide, category, horizonYears);
    const ret = fundSide.returnsDirectByHorizon[horizonYears] ?? null;
    const ter = fundSide.terDirectPct ?? null;
    const alpha = fundSide.alphaByHorizon[horizonYears] ?? null;

    const aumCross = resolveCrossBucketAum(bucketPrevious, bucketLatest, schemeKey);
    const aumGrowthDelta =
      aumCross.aumLatest !== null && Number.isFinite(aumCross.aumLatest)
        ? aumCross.isNewFund
          ? aumCross.aumLatest
          : aumCross.aumDiff !== null && Number.isFinite(aumCross.aumDiff)
            ? aumCross.aumDiff
            : null
        : null;
    const aumCaption =
      aumCross.isNewFund && aumCross.aumLatest !== null
        ? "New listing in latest snapshot — flow equals full current AUM (no prior row matched)"
        : bucketSide === bucketPrevious
          ? "Positive flow (latest vs prior reporting snapshot — fallback when intra-period AUM history is unavailable)"
          : "Positive flow (latest > previous)";

    const irDirect = fundSide.infoRatioDirectByHorizon[horizonYears] ?? null;

    const fin = (v: number | null | undefined) => v !== null && v !== undefined && Number.isFinite(v);
    const rankable =
      fin(ret) &&
      fin(catStats.avgReturnDirect) &&
      aumGrowthDelta !== null &&
      fin(aumGrowthDelta) &&
      fin(ter) &&
      fin(catStats.avgTER) &&
      fin(alpha) &&
      fin(irDirect);

    // 1 Return>cat · 2 AUMΔ>0 · 3 TER<cat · 4 Alpha>0 · 5 IR (Direct)>1
    const c1 = ret !== null && catStats.avgReturnDirect !== null && ret > catStats.avgReturnDirect;
    const c2 = aumGrowthDelta !== null && aumGrowthDelta > 0;
    const c3 = ter !== null && catStats.avgTER !== null && ter < catStats.avgTER;
    const c4 = alpha !== null && alpha > 0;
    const c5 = irDirect !== null && Number.isFinite(irDirect) && irDirect > 1;

    const checks = [
      { label: "return>cat_avg", pass: c1 },
      { label: "aum_change>0", pass: c2 },
      { label: "ter<cat_avg", pass: c3 },
      { label: "alpha>0", pass: c4 },
      { label: "consistency_ir>1", pass: c5 }
    ];
    const score = checks.reduce((sum, c) => sum + (c.pass ? 1 : 0), 0);
    const reasons = checks.map((c) => `${c.label}: ${c.pass ? "+1" : "0"}`);

    const conditions: IScoreCondition[] = [
      { id: "return", title: "Return > category avg", caption: "Direct return vs category average", pass: c1 },
      { id: "aum", title: "AUM change", caption: aumCaption, pass: c2 },
      {
        id: "ter",
        title: "Expense ratio",
        caption: "Direct plan total TER below category average (from TER file)",
        pass: c3
      },
      { id: "alpha", title: "Alpha > 0", caption: "Alpha at selected horizon", pass: c4 },
      {
        id: "consistency",
        title: "Consistency (IR Direct)",
        caption: `Information ratio* ${horizonYears}Y (Direct) > 1`,
        pass: c5
      }
    ];

    return {
      score,
      total: 5,
      reasons,
      conditions,
      rankable
    };
  }

  function computeFundRankingSnapshot(params: {
    bucketSide: IBucketData;
    schemeKey: ISchemeKey;
    category: string;
    horizonYears: ITimeframeYears;
    bucketPrevious: IBucketData;
    bucketLatest: IBucketData;
  }): IFundRankingSnapshot {
    const d = computeScoreDetails(params);
    return { score: d.score, total: d.total, conditions: d.conditions, rankable: d.rankable };
  }

  return {
    getCategoryStats,
    computeScoreDetails,
    computeFundRankingSnapshot
  };
}

export type MetricsEngine = ReturnType<typeof createMetricsEngine>;
