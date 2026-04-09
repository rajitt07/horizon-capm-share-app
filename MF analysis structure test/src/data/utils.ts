import type { IJoinedFund, ITimeframeYears } from "./types";

export function normalizeKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function safeTrim(value: unknown): string {
  return String(value ?? "").trim();
}

/** Expands common AMC tickers so e.g. “ABSL …” aligns with “Aditya Birla Sun Life …” in {@link generateUniversalKey}. */
function expandAmcAbbreviations(name: string): string {
  return String(name ?? "")
    .replace(/\bABSL\b/gi, "Aditya Birla Sun Life")
    .replace(/\bICICI\s*Pru\b/gi, "ICICI Prudential")
    .replace(/\bNippon\s*India\b/gi, "Nippon India");
}

/** Strips common AMFI / factsheet suffixes for cross-source name matching. */
export function stripFundLabelSuffixes(name: string): string {
  let s = String(name).trim();
  s = s.replace(/\s*\(G\)\s*/gi, " ");
  s = s.replace(/\s*\(G\)\s*$/i, "");
  s = s.replace(/\s*-\s*Growth\s*$/i, "");
  s = s.replace(/\s*-\s*Direct\s*Plan\s*$/i, "");
  s = s.replace(/\s*-\s*Direct\s*$/i, "");
  s = s.replace(/\s*-\s*Dir\s*$/i, "");
  s = s.replace(/\s*-\s*Plan\s*$/i, "");
  return s.trim();
}

const UNIVERSAL_NOISE = new Set([
  "direct",
  "growth",
  "plan",
  "regular",
  "dir",
  "idcw",
  "dividend",
  "option"
]);

/**
 * Universal join key: lowercase, strip noise tokens (Direct, Growth, Plan, Regular, Dir, G, IDCW, etc.),
 * remove spaces/punctuation, concatenate alphanumerics. Use for performance ↔ AMFI (e.g. ABSL vs long names).
 */
export function generateUniversalKey(name: string): string {
  let s = expandAmcAbbreviations(String(name ?? ""));
  s = stripFundLabelSuffixes(s);
  s = s.toLowerCase();
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/\s*\(g\)\s*/gi, " ");
  s = s.replace(/\*+/g, " ");
  s = s.replace(/[^a-z0-9]+/g, " ");
  const tokens = s.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const t of tokens) {
    if (UNIVERSAL_NOISE.has(t)) continue;
    if (t === "g") continue;
    out.push(t);
  }
  return out.join("");
}

/** @deprecated Prefer generateUniversalKey — kept for call sites that expect the same behavior. */
export function normalizeName(value: unknown): string {
  return generateUniversalKey(String(value ?? ""));
}

/** Dice coefficient on character bigrams (0–1). Used for partial name match fallback. */
function diceBigramCoefficient(a: string, b: string): number {
  if (!a.length || !b.length) return 0;
  if (a.length < 2 && b.length < 2) return a === b ? 1 : 0;
  if (a.length < 2) return b.includes(a) ? 0.75 : 0;
  if (b.length < 2) return a.includes(b) ? 0.75 : 0;
  const countBigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      m.set(bg, (m.get(bg) ?? 0) + 1);
    }
    return m;
  };
  const A = countBigrams(a);
  const B = countBigrams(b);
  let inter = 0;
  for (const [bg, ca] of A) {
    const cb = B.get(bg) ?? 0;
    inter += Math.min(ca, cb);
  }
  return (2 * inter) / (a.length - 1 + b.length - 1);
}

/**
 * Similarity in [0,1] between two fund names after {@link generateUniversalKey} (noise stripped).
 * Use for “~70% match” safety net vs strict equality.
 */
export function nameSimilarityScore(perfName: string, amfiName: string): number {
  const a = generateUniversalKey(perfName);
  const b = generateUniversalKey(amfiName);
  if (!a.length || !b.length) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return Math.max(0.72, diceBigramCoefficient(a, b));
  return diceBigramCoefficient(a, b);
}

/** Canonical key for performance ↔ TER ↔ AMFI fuzzy name joins (no scheme code). */
export function normalizeFundMatchKey(value: unknown): string {
  return normalizeKey(stripFundLabelSuffixes(String(value ?? "")));
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  let raw = String(value).trim();
  if (!raw || raw.toLowerCase() === "na" || raw.toLowerCase() === "null") return null;
  raw = raw.replace(/\s*\(G\)\s*/gi, "").replace(/\*+/g, "");
  const cleaned = raw.replace(/,/g, "").replace(/%/g, "");
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function meanIgnoreNulls(values: Array<number | null | undefined>): number | null {
  let sum = 0;
  let count = 0;
  for (const v of values) {
    if (v === null || v === undefined) continue;
    if (!Number.isFinite(v)) continue;
    sum += v;
    count++;
  }
  return count === 0 ? null : sum / count;
}

export function format2(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "NA";
  return value.toFixed(2);
}

export function parseDateToMs(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  // ISO: YYYY-MM-DD
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]) - 1;
    const d = Number(iso[3]);
    const dt = new Date(Date.UTC(y, m, d));
    return Number.isFinite(dt.getTime()) ? dt.getTime() : null;
  }

  // DD-MMM-YYYY (e.g., 30-Sep-2025)
  const ddMmm = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (ddMmm) {
    const day = Number(ddMmm[1]);
    const monStr = ddMmm[2].toLowerCase();
    const year = Number(ddMmm[3]);
    const monthMap: Record<string, number> = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dec: 11
    };
    const month = monthMap[monStr];
    if (!Number.isFinite(day) || !Number.isFinite(year) || month === undefined) return null;
    const dt = new Date(year, month, day);
    return Number.isFinite(dt.getTime()) ? dt.getTime() : null;
  }

  // DD/MM/YYYY
  const ddSlash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddSlash) {
    const day = Number(ddSlash[1]);
    const month = Number(ddSlash[2]) - 1;
    const year = Number(ddSlash[3]);
    const dt = new Date(year, month, day);
    return Number.isFinite(dt.getTime()) ? dt.getTime() : null;
  }

  // DD/MM/YY (e.g. 23/03/26)
  const ddSlashYY = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (ddSlashYY) {
    const day = Number(ddSlashYY[1]);
    const month = Number(ddSlashYY[2]) - 1;
    let year = Number(ddSlashYY[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const dt = new Date(year, month, day);
    return Number.isFinite(dt.getTime()) ? dt.getTime() : null;
  }

  // Fallback: Date.parse
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return null;
  return t;
}

export function horizonToYearsFloat(h: string): number {
  const n = Number(h);
  return Number.isFinite(n) ? n : 1;
}

const ALL_RETURN_HORIZONS: ITimeframeYears[] = ["1", "3", "5", "10"];

/**
 * True when every standard horizon has no finite direct return and no finite benchmark return
 * (fund too new / no history in the performance file for any of 1Y–10Y).
 */
export function fundHasNoReturnHistory(fund: IJoinedFund | undefined | null): boolean {
  if (!fund) return false;
  for (const h of ALL_RETURN_HORIZONS) {
    const d = fund.returnsDirectByHorizon[h];
    const b = fund.returnsBenchmarkByHorizon[h];
    const dEmpty = d === null || d === undefined || !Number.isFinite(d);
    const bEmpty = b === null || b === undefined || !Number.isFinite(b);
    if (!dEmpty || !bEmpty) return false;
  }
  return true;
}

