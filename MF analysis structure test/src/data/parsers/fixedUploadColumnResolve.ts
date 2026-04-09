import type { ITimeframeYears } from "../types";
import { normalizeKey } from "../utils";

const HORIZONS: ITimeframeYears[] = ["1", "3", "5", "10"];

/**
 * Canonical header strings for user performance exports (CRISIL-style).
 * Parser tries exact normalized match against sheet headers first; if any required
 * header is missing, falls back to legacy fuzzy column detection.
 */
export const USER_FIXED_PERFORMANCE_HEADERS = {
  SCHEME_NAME: "Scheme Name",
  BENCHMARK: "Benchmark",
  AUM: "Daily AUM (Cr.)",
  RETURN_DIRECT: {
    "1": "Return 1 Year (%) Direct",
    "3": "Return 3 Year (%) Direct",
    "5": "Return 5 Year (%) Direct",
    "10": "Return 10 Year (%) Direct"
  } as Record<ITimeframeYears, string>,
  RETURN_BENCHMARK: {
    "1": "Return 1 Year (%) Benchmark",
    "3": "Return 3 Year (%) Benchmark",
    "5": "Return 5 Year (%) Benchmark",
    "10": "Return 10 Year (%) Benchmark"
  } as Record<ITimeframeYears, string>,
  INFO_RATIO_DIRECT: {
    "1": "Information Ratio* 1 Year (Direct)",
    "3": "Information Ratio* 3 Year (Direct)",
    "5": "Information Ratio* 5 Year (Direct)",
    "10": "Information Ratio* 10 Year (Direct)"
  } as Record<ITimeframeYears, string>,
  /** Optional — sheets without this column still use fixed template for other fields. */
  RETURN_SINCE_LAUNCH_DIRECT_BENCHMARK: "Return Since Launch Direct Benchmark"
} as const;

/** User TER CSV template (AMFI-style + NSDL code column). */
export const USER_FIXED_TER_HEADERS = {
  NSDL_SCHEME_CODE: "NSDL Scheme Code",
  SCHEME_NAME: "Scheme Name",
  DIRECT_PLAN_TOTAL_TER_PCT: "Direct Plan - Total TER (%)"
} as const;

export type PerfColumnParseMode = "fixed_template" | "legacy_fallback";
export type TerColumnParseMode = "fixed_template" | "legacy_fallback";

/** Actual row keys as they appear on the sheet (first normalized match). */
export type FixedPerformanceColumnKeys = {
  benchmarkKey: string;
  aumKey: string;
  direct: Record<ITimeframeYears, string>;
  bench: Record<ITimeframeYears, string>;
  ir: Record<ITimeframeYears, string>;
  returnSinceLaunchDirectBenchmarkKey?: string;
};

export type FixedTerColumnKeys = {
  nsdlKey: string;
  schemeNameKey: string;
  terKey: string;
};

export function findHeaderKey(headers: string[], expectedLabel: string): string | undefined {
  const want = normalizeKey(expectedLabel);
  return headers.find((h) => normalizeKey(h) === want);
}

/**
 * Returns resolved keys when every template header is present; otherwise null (use legacy).
 */
export function tryResolveFixedPerformanceKeys(headers: string[]): FixedPerformanceColumnKeys | null {
  if (!findHeaderKey(headers, USER_FIXED_PERFORMANCE_HEADERS.SCHEME_NAME)) return null;
  const benchmarkKey = findHeaderKey(headers, USER_FIXED_PERFORMANCE_HEADERS.BENCHMARK);
  const aumKey = findHeaderKey(headers, USER_FIXED_PERFORMANCE_HEADERS.AUM);
  if (!benchmarkKey || !aumKey) return null;

  const direct = {} as Record<ITimeframeYears, string>;
  const bench = {} as Record<ITimeframeYears, string>;
  const ir = {} as Record<ITimeframeYears, string>;
  for (const h of HORIZONS) {
    const dk = findHeaderKey(headers, USER_FIXED_PERFORMANCE_HEADERS.RETURN_DIRECT[h]);
    const bk = findHeaderKey(headers, USER_FIXED_PERFORMANCE_HEADERS.RETURN_BENCHMARK[h]);
    const ik = findHeaderKey(headers, USER_FIXED_PERFORMANCE_HEADERS.INFO_RATIO_DIRECT[h]);
    if (!dk || !bk || !ik) return null;
    direct[h] = dk;
    bench[h] = bk;
    ir[h] = ik;
  }

  const returnSinceLaunchDirectBenchmarkKey = findHeaderKey(
    headers,
    USER_FIXED_PERFORMANCE_HEADERS.RETURN_SINCE_LAUNCH_DIRECT_BENCHMARK
  );

  return { benchmarkKey, aumKey, direct, bench, ir, returnSinceLaunchDirectBenchmarkKey };
}

export function tryResolveFixedTerKeys(headers: string[]): FixedTerColumnKeys | null {
  const nsdlKey = findHeaderKey(headers, USER_FIXED_TER_HEADERS.NSDL_SCHEME_CODE);
  const schemeNameKey = findHeaderKey(headers, USER_FIXED_TER_HEADERS.SCHEME_NAME);
  const terKey = findHeaderKey(headers, USER_FIXED_TER_HEADERS.DIRECT_PLAN_TOTAL_TER_PCT);
  if (!nsdlKey || !schemeNameKey || !terKey) return null;
  return { nsdlKey, schemeNameKey, terKey };
}
