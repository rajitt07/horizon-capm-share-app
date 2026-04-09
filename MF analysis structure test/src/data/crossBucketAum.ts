import type { IBucketData, IJoinedFund, ISchemeKey } from "./types";
import { generateUniversalKey, nameSimilarityScore, normalizeName, safeTrim } from "./utils";

export type CrossBucketAumMatch = "schemeKey" | "universalName" | "newFund" | "none";

export interface CrossBucketAumResult {
  aumLatest: number | null;
  /** Previous reporting AUM when matched; null for “new fund” (no prior row). */
  aumPrev: number | null;
  /** Latest − previous; for new funds equals full current AUM. */
  aumDiff: number | null;
  match: CrossBucketAumMatch;
  /** True when the fund exists in latest but no previous bucket row could be matched. */
  isNewFund: boolean;
}

const NAME_FALLBACK_MIN = 0.88;

/**
 * Resolves Previous vs Latest AUM for a scheme in the Latest bucket.
 * Formula: **Latest bucket AUM − Previous bucket AUM** (same fund, matched by scheme key then {@link normalizeName}).
 * 1) Same schemeKey in previous bucket with finite AUM.
 * 2) Else: match previous row by {@link normalizeName} (handles case/whitespace/suffix drift) or similarity ≥ threshold.
 * 3) Else: new in latest only — UI shows as “New Fund” (+100% / current Cr.); numeric diff = full latest AUM.
 */
export function resolveCrossBucketAum(
  bucketPrev: IBucketData,
  bucketLatest: IBucketData,
  schemeKey: ISchemeKey
): CrossBucketAumResult {
  const fundLatest = bucketLatest.fundsByKey.get(schemeKey);
  const rawLatest = fundLatest?.aumCr;
  const aumLatest = rawLatest !== null && rawLatest !== undefined && Number.isFinite(rawLatest) ? rawLatest : null;

  if (aumLatest === null) {
    return { aumLatest: null, aumPrev: null, aumDiff: null, match: "none", isNewFund: false };
  }

  const fundPrevSameKey = bucketPrev.fundsByKey.get(schemeKey);
  const directPrev = fundPrevSameKey?.aumCr;
  if (directPrev !== null && directPrev !== undefined && Number.isFinite(directPrev)) {
    return {
      aumLatest,
      aumPrev: directPrev,
      aumDiff: aumLatest - directPrev,
      match: "schemeKey",
      isNewFund: false
    };
  }

  const nameLatest = safeTrim(fundLatest?.schemeName ?? "");
  const normLatest = normalizeName(nameLatest);
  const keyLatest = generateUniversalKey(nameLatest);

  let best: { fund: IJoinedFund; score: number } | null = null;
  for (const f of bucketPrev.fundsByKey.values()) {
    const aum = f.aumCr;
    if (aum === null || aum === undefined || !Number.isFinite(aum)) continue;

    const namePrev = safeTrim(f.schemeName);
    const normPrev = normalizeName(namePrev);
    let score = 0;
    if (normLatest.length > 0 && normPrev.length > 0 && normLatest === normPrev) {
      score = 1;
    } else {
      const kPrev = generateUniversalKey(namePrev);
      if (keyLatest.length > 0 && kPrev.length > 0 && keyLatest === kPrev) {
        score = 1;
      } else {
        const sim = nameSimilarityScore(nameLatest, namePrev);
        if (sim >= NAME_FALLBACK_MIN) score = sim;
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { fund: f, score };
  }

  if (best) {
    const aumPrev = best.fund.aumCr!;
    return {
      aumLatest,
      aumPrev,
      aumDiff: aumLatest - aumPrev,
      match: "universalName",
      isNewFund: false
    };
  }

  return {
    aumLatest,
    aumPrev: null,
    aumDiff: aumLatest,
    match: "newFund",
    isNewFund: true
  };
}
