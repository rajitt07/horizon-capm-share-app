import type { IBucketData, IFundRankingSnapshot, IJoinedFund, ISchemeKey, ITimeframeYears } from "./types";
import type { MetricsEngine } from "./metrics";

export type PeerScope = "category" | "universe";

/** Score snapshot: rankingsByHorizon when present, else computeScoreDetails (same pattern as LeaderboardPanel). */
export function getScoreForFund(
  fund: IJoinedFund,
  schemeKey: ISchemeKey,
  bucketSide: IBucketData,
  bucketPrevious: IBucketData,
  bucketLatest: IBucketData,
  horizon: ITimeframeYears,
  engine: MetricsEngine,
  rankMap: Map<ISchemeKey, IFundRankingSnapshot> | undefined
): number {
  const cat = fund.category?.trim();
  if (!cat) return 0;
  const snap = rankMap?.get(schemeKey);
  if (snap) return snap.score;
  return engine.computeScoreDetails({
    bucketSide,
    schemeKey,
    category: cat,
    horizonYears: horizon,
    bucketPrevious,
    bucketLatest
  }).score;
}

export type LeaderboardRow = { schemeKey: string; fund: IJoinedFund; score: number; rankable: boolean };

/** Higher return/alpha first; nulls last (stable tie-break: schemeKey). */
export function compareNullableNumDesc(a: number | null, b: number | null): number {
  const na = a != null && Number.isFinite(a) ? a : null;
  const nb = b != null && Number.isFinite(b) ? b : null;
  if (na === null && nb === null) return 0;
  if (na === null) return 1;
  if (nb === null) return -1;
  return nb - na;
}

/** Score desc, then direct return at horizon, then alpha at horizon, then schemeKey (no name-based “quality” tie-break). */
export function compareByScoreReturnAlpha(
  scoreA: number,
  fundA: IJoinedFund,
  scoreB: number,
  fundB: IJoinedFund,
  horizon: ITimeframeYears
): number {
  const ds = scoreB - scoreA;
  if (ds !== 0) return ds;
  const rCmp = compareNullableNumDesc(
    fundA.returnsDirectByHorizon[horizon] ?? null,
    fundB.returnsDirectByHorizon[horizon] ?? null
  );
  if (rCmp !== 0) return rCmp;
  const aCmp = compareNullableNumDesc(
    fundA.alphaByHorizon[horizon] ?? null,
    fundB.alphaByHorizon[horizon] ?? null
  );
  if (aCmp !== 0) return aCmp;
  return fundA.schemeKey.localeCompare(fundB.schemeKey);
}

/** Rankable funds sort before non-rankable; then score / return / alpha (same as {@link compareByScoreReturnAlpha}). */
export function compareByScoreReturnAlphaWithRankable(
  scoreA: number,
  fundA: IJoinedFund,
  rankableA: boolean,
  scoreB: number,
  fundB: IJoinedFund,
  rankableB: boolean,
  horizon: ITimeframeYears
): number {
  if (rankableA !== rankableB) return rankableA ? -1 : 1;
  return compareByScoreReturnAlpha(scoreA, fundA, scoreB, fundB, horizon);
}

export function compareLeaderboardRowsByScoreReturnAlpha(
  a: LeaderboardRow,
  b: LeaderboardRow,
  horizon: ITimeframeYears
): number {
  return compareByScoreReturnAlphaWithRankable(a.score, a.fund, a.rankable, b.score, b.fund, b.rankable, horizon);
}

/**
 * Score-ordered list of all bucket funds with a category (for Compare / peer distance — not a user-facing “global rank”).
 */
export function buildGlobalOrderedRows(
  bucketSide: IBucketData,
  bucketPrevious: IBucketData,
  bucketLatest: IBucketData,
  horizon: ITimeframeYears,
  engine: MetricsEngine,
  rankMap: Map<ISchemeKey, IFundRankingSnapshot> | undefined
): LeaderboardRow[] {
  const rows: LeaderboardRow[] = [];
  for (const fund of bucketSide.fundsByKey.values()) {
    const cat = fund.category?.trim();
    if (!cat) continue;
    const snap = rankMap?.get(fund.schemeKey);
    const d = snap
      ? { score: snap.score, rankable: snap.rankable ?? false }
      : engine.computeScoreDetails({
          bucketSide,
          schemeKey: fund.schemeKey,
          category: cat,
          horizonYears: horizon,
          bucketPrevious,
          bucketLatest
        });
    rows.push({ schemeKey: fund.schemeKey, fund, score: d.score, rankable: d.rankable });
  }
  rows.sort((a, b) => compareLeaderboardRowsByScoreReturnAlpha(a, b, horizon));
  return rows;
}

/** Category-scoped ordering (same comparator as bucket-wide list, only peers in `category`). */
export function filterCategoryRows(
  globalOrdered: LeaderboardRow[],
  category: string,
  horizon: ITimeframeYears
): LeaderboardRow[] {
  const cat = category.trim();
  return globalOrdered
    .filter((x) => x.fund.category?.trim() === cat)
    .sort((a, b) => compareLeaderboardRowsByScoreReturnAlpha(a, b, horizon));
}

/**
 * Closeness (both scopes): primary = index distance in the score-ordered list (|index_peer − index_anchor|);
 * tie-break: smaller |score_peer − score_anchor|; then smaller |direct return gap| at `horizon`.
 */
function orderByRankDistance(
  orderedRows: LeaderboardRow[],
  anchorKey: string,
  anchorFund: IJoinedFund,
  horizon: ITimeframeYears,
  excludeKeys: ReadonlySet<string>
): string[] {
  const anchorIdx = orderedRows.findIndex((r) => r.schemeKey === anchorKey);
  if (anchorIdx < 0) return [];
  const anchorScore = orderedRows[anchorIdx].score;
  const anchorRet = anchorFund.returnsDirectByHorizon[horizon] ?? null;

  type Cand = { k: string; dist: number; sd: number; rg: number };
  const cands: Cand[] = [];
  for (let i = 0; i < orderedRows.length; i++) {
    const row = orderedRows[i];
    if (row.schemeKey === anchorKey) continue;
    if (excludeKeys.has(row.schemeKey)) continue;
    const dist = Math.abs(i - anchorIdx);
    const sd = Math.abs(row.score - anchorScore);
    const r = row.fund.returnsDirectByHorizon[horizon] ?? null;
    const rg =
      anchorRet !== null && r !== null && Number.isFinite(anchorRet) && Number.isFinite(r)
        ? Math.abs(r - anchorRet)
        : Number.POSITIVE_INFINITY;
    cands.push({ k: row.schemeKey, dist, sd, rg });
  }
  cands.sort((a, b) => a.dist - b.dist || a.sd - b.sd || a.rg - b.rg);
  return cands.map((c) => c.k);
}

/**
 * Same category: peer universe = funds with fund.category === anchor.category only.
 * Ordered list = category leaderboard; closeness = rank distance within that list (never crosses categories).
 */
export function orderPeersCategoryScope(
  anchorKey: string,
  anchorCategory: string,
  globalOrdered: LeaderboardRow[],
  horizon: ITimeframeYears,
  excludeKeys: ReadonlySet<string>
): string[] {
  const cat = anchorCategory.trim();
  if (!cat) return [];
  const anchorFund = globalOrdered.find((r) => r.schemeKey === anchorKey)?.fund;
  if (!anchorFund) return [];
  const categoryRows = filterCategoryRows(globalOrdered, cat, horizon);
  return orderByRankDistance(categoryRows, anchorKey, anchorFund, horizon, excludeKeys);
}

/**
 * All categories: peer universe = entire bucket (funds with category). Ordered list = score-ordered bucket list.
 * Closeness: index distance vs anchor in that list, then same tie-breakers as category mode.
 */
export function orderPeersUniverseScope(
  anchorKey: string,
  globalOrdered: LeaderboardRow[],
  horizon: ITimeframeYears,
  excludeKeys: ReadonlySet<string>
): string[] {
  const anchorFund = globalOrdered.find((r) => r.schemeKey === anchorKey)?.fund;
  if (!anchorFund) return [];
  return orderByRankDistance(globalOrdered, anchorKey, anchorFund, horizon, excludeKeys);
}

export type FundRankMeta = {
  score: number;
  catRank: number | null;
  catTotal: number | null;
  rankable: boolean;
};

export function getFundRankMeta(
  schemeKey: string,
  fund: IJoinedFund,
  globalOrdered: LeaderboardRow[],
  bucketSide: IBucketData,
  bucketPrevious: IBucketData,
  bucketLatest: IBucketData,
  horizon: ITimeframeYears,
  engine: MetricsEngine,
  rankMap: Map<ISchemeKey, IFundRankingSnapshot> | undefined
): FundRankMeta {
  const snap = rankMap?.get(schemeKey);
  const d = snap
    ? { score: snap.score, rankable: snap.rankable ?? false }
    : (() => {
        const c = fund.category?.trim();
        if (!c) return { score: 0, rankable: false };
        return engine.computeScoreDetails({
          bucketSide,
          schemeKey,
          category: c,
          horizonYears: horizon,
          bucketPrevious,
          bucketLatest
        });
      })();
  const score = d.score;
  const rankable = d.rankable;
  const cat = fund.category?.trim();
  let catRank: number | null = null;
  let catTotal: number | null = null;
  if (cat && rankable) {
    const catRows = filterCategoryRows(globalOrdered, cat, horizon).filter((x) => x.rankable);
    const cIdx = catRows.findIndex((x) => x.schemeKey === schemeKey);
    if (cIdx >= 0) {
      catRank = cIdx + 1;
      catTotal = catRows.length;
    }
  }
  return { score, catRank, catTotal, rankable };
}
