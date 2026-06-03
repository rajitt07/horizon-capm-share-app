import type { IBucketData, ISchemeKey } from "./types";
import { generateUniversalKey, normalizeName, safeTrim } from "./utils";

export type CrossBucketAumMatch = "schemeKey" | "universalName" | "newFund" | "unmatched" | "none";

export interface CrossBucketAumResult {
  aumLatest: number | null;
  /** Previous reporting AUM when matched; null for "unmatched" or data gap. */
  aumPrev: number | null;
  /** Latest − previous; null when unmatched or AUM data unavailable. */
  aumDiff: number | null;
  match: CrossBucketAumMatch;
  /** True only when the fund key genuinely did not exist in the previous bucket (kept for display). */
  isNewFund: boolean;
}

/**
 * Resolves Previous vs Latest AUM for a scheme using exact matching only — no fuzzy/similarity
 * fallback to prevent wrong-fund pairings (e.g. two similar large-cap names from same AMC).
 *
 * Matching order:
 * 1) Same schemeKey in previous bucket with finite AUM.
 * 2) Exact {@link generateUniversalKey} or {@link normalizeName} match — handles suffix/case/plan-label drift.
 * 3) "unmatched" — AUM delta returned as null; score condition treated as unavailable (not as new fund).
 *    This covers renames, rebrands, and missing-AUM rows without inflating AUM change.
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

  // Level 1: exact scheme key
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

  // Level 2: exact universal-key / normalized-name match (suffix, case, plan-label drift)
  for (const f of bucketPrev.fundsByKey.values()) {
    const aum = f.aumCr;
    if (aum === null || aum === undefined || !Number.isFinite(aum)) continue;
    const namePrev = safeTrim(f.schemeName);
    const normPrev = normalizeName(namePrev);
    const kPrev = generateUniversalKey(namePrev);
    const exactNorm = normLatest.length > 0 && normPrev.length > 0 && normLatest === normPrev;
    const exactKey = keyLatest.length > 0 && kPrev.length > 0 && keyLatest === kPrev;
    if (exactNorm || exactKey) {
      return {
        aumLatest,
        aumPrev: aum,
        aumDiff: aumLatest - aum,
        match: "universalName",
        isNewFund: false
      };
    }
  }

  // Level 3: no exact match — could be renamed, rebranded, or AUM missing last month.
  // Return null diff so the AUM score condition is treated as unavailable rather than
  // incorrectly passing (full current AUM) or failing (0 delta).
  const prevRowExists = bucketPrev.fundsByKey.has(schemeKey);
  return {
    aumLatest,
    aumPrev: null,
    aumDiff: null,
    match: "unmatched",
    isNewFund: !prevRowExists
  };
}
