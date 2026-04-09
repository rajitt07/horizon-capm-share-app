import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { IPerformance, ITimeframeYears } from "../types";
import { resolveCanonicalCategory } from "../categoryMap";
import { generateUniversalKey, normalizeKey, parseDateToMs, parseNumber, safeTrim } from "../utils";
import type { FixedPerformanceColumnKeys, PerfColumnParseMode } from "./fixedUploadColumnResolve";
import {
  findHeaderKey,
  tryResolveFixedPerformanceKeys,
  USER_FIXED_PERFORMANCE_HEADERS
} from "./fixedUploadColumnResolve";

const horizons: ITimeframeYears[] = ["1", "3", "5", "10"];

function pickHeader(row: Record<string, any>, wanted: string[]): any {
  for (const w of wanted) {
    const hit = Object.keys(row).find((k) => normalizeKey(k) === normalizeKey(w));
    if (hit) return row[hit];
  }
  return undefined;
}

function schemeKeyFromRow(row: Record<string, any>): { schemeKey: string; schemeName: string } | null {
  const schemeCode =
    pickHeader(row, ["scheme_code", "Scheme Code", "scheme code"]) ??
    pickHeader(row, ["amfi_code", "amfi code", "AMFI Code"]);
  const schemeName =
    pickHeader(row, ["scheme_name", "Scheme Name", "scheme name"]) ??
    pickHeader(row, ["Scheme", "scheme"]);

  const keyRaw = schemeName ?? schemeCode;
  if (keyRaw === undefined || keyRaw === null || String(keyRaw).trim().length === 0) return null;
  const schemeNameStr = String(schemeName ?? keyRaw).trim();
  const codeStr = schemeCode !== undefined && schemeCode !== null ? String(schemeCode).trim() : "";
  if (codeStr.length > 0) {
    return { schemeKey: normalizeKey(codeStr), schemeName: schemeNameStr };
  }
  return { schemeKey: generateUniversalKey(schemeNameStr), schemeName: schemeNameStr };
}

function findReturnCols(headers: string[], horizon: ITimeframeYears) {
  const normalize = (s: string) => normalizeKey(s);
  const targetDirect = [
    `Return ${horizon} Year (%) Direct`,
    `Return ${horizon}Y (%) Direct`,
    `Return ${horizon} Year Direct`
  ];
  const targetBench = [
    `Benchmark Return ${horizon} Year (%)`,
    `Return ${horizon} Year (%) Benchmark`,
    `Return ${horizon}Y (%) Benchmark`,
    `Benchmark Return ${horizon} Year`
  ];
  const directHit = headers.find((h) => {
    const n = normalize(h);
    if (targetDirect.some((t) => n === normalize(t))) return true;
    if (horizon === "1") {
      const has1 = n.includes("1") && (n.includes("year") || n.includes("yr"));
      const hasDirect = n.includes("direct");
      const hasBench = n.includes("benchmark");
      if (has1 && hasDirect && !hasBench) return true;
    }
    return n.includes(`return ${horizon}`) && n.includes("direct") && !n.includes("benchmark");
  });
  const benchHit = headers.find((h) => {
    const n = normalize(h);
    if (targetBench.some((t) => n === normalize(t))) return true;
    if (horizon === "1") {
      const has1 = n.includes("1") && (n.includes("year") || n.includes("yr"));
      if (n.includes("benchmark") && n.includes("return") && has1) return true;
    }
    if (n.includes("benchmark") && n.includes(`return ${horizon}`)) return true;
    if (n.startsWith("benchmark return") && n.includes(`${horizon}`)) return true;
    return false;
  });
  return { directHit, benchHit };
}

/** Column "Information Ratio* {horizon} Year (Direct)" (and close variants) per horizon. */
function findInformationRatioDirectCol(headers: string[], horizon: ITimeframeYears): string | undefined {
  const norm = (s: string) => normalizeKey(s);
  const candidates = [
    `Information Ratio* ${horizon} Year (Direct)`,
    `Information Ratio* ${horizon}Year (Direct)`,
    `Information Ratio ${horizon} Year (Direct)`,
    `Information Ratio ${horizon}Year (Direct)`
  ];
  for (const c of candidates) {
    const w = norm(c);
    const hit = headers.find((h) => norm(h) === w);
    if (hit) return hit;
  }
  return headers.find((h) => {
    const n = norm(h);
    if (!n.includes("information ratio") || !n.includes("direct")) return false;
    if (n.includes("benchmark")) return false;
    if (horizon === "10") return n.includes("10 year") || n.includes("10year") || n.includes("10 y");
    if (horizon === "1") {
      if (n.includes("10 year") || n.includes("10year") || /\b10\s*y/.test(n)) return false;
      return n.includes("1 year") || n.includes("1year") || n.includes(" 1 y");
    }
    if (horizon === "3") return n.includes("3 year") || n.includes("3year");
    if (horizon === "5") return n.includes("5 year") || n.includes("5year");
    return false;
  });
}

function extractNumericOrNull(row: Record<string, any>, header: string | undefined): number | null {
  if (!header) return null;
  return parseNumber(row[header]);
}

type INamedRow = Record<string, any>;

export interface IPerformanceParseResult {
  funds: Map<string, IPerformance>;
  /** Latest reporting date found in performance rows (e.g. NAV Date). */
  reportingDateMs: number | null;
  /** Cleaned fund rows for debugging (no category section rows). */
  rawDebugRows?: Array<Record<string, unknown>>;
  /** Present after {@link parsePerformanceFiles}: last file label (`webkitRelativePath || name`) per scheme key. */
  perfSourceBySchemeKey?: Map<string, string>;
  /** User template headers matched exactly vs legacy fuzzy column detection. */
  perfColumnParseMode?: PerfColumnParseMode;
}

function maxDateMs(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/** Scan title rows above the fund table for "Data as of" / "As on" / dated cells. */
function extractReportingDateFromSheetTop(aoa: unknown[][], headerIdx: number): number | null {
  let maxMs: number | null = null;
  const labelRe =
    /(?:data\s+as\s+of|as\s+on|as\s+at|reporting\s+date|report\s+date|for\s+the\s+period|portfolio\s+as\s+on)\s*[:\-]?\s*(.+)/i;
  for (let r = 0; r < headerIdx && r < aoa.length; r++) {
    for (const cell of aoa[r] ?? []) {
      const s = safeTrim(cell);
      if (!s) continue;
      const m = s.match(labelRe);
      if (m?.[1]) {
        const ms = parseDateToMs(m[1].trim());
        if (ms !== null && (maxMs === null || ms > maxMs)) maxMs = ms;
      } else {
        const ms = parseDateToMs(s);
        if (ms !== null && (maxMs === null || ms > maxMs)) maxMs = ms;
      }
    }
  }
  for (let r = 0; r < headerIdx && r < aoa.length; r++) {
    for (const cell of aoa[r] ?? []) {
      const s = safeTrim(cell);
      if (/^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(s) || /^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const ms = parseDateToMs(s);
        if (ms !== null && (maxMs === null || ms > maxMs)) maxMs = ms;
      }
    }
  }
  return maxMs;
}

function extractReportingDateMsFromRows(rows: INamedRow[], headers: string[]): number | null {
  const dateCol = headers.find(
    (h) =>
      normalizeKey(h) === normalizeKey("NAV Date") ||
      normalizeKey(h) === normalizeKey("nav_date") ||
      (normalizeKey(h).includes("nav") && normalizeKey(h).includes("date") && !normalizeKey(h).includes("regular"))
  );
  if (!dateCol) return null;
  let maxMs: number | null = null;
  for (const row of rows) {
    const ms = parseDateToMs(row[dateCol]);
    if (ms !== null && (maxMs === null || ms > maxMs)) maxMs = ms;
  }
  return maxMs;
}

/** Row where col "Scheme Name" is a section title (e.g. EQUITY SCHEMES), not a fund. */
function isCategorySectionRow(schemeCell: string): boolean {
  const s = safeTrim(schemeCell);
  if (!s) return false;
  const n = normalizeKey(s);
  if (/^(equity|debt|hybrid|liquid|solution\s+oriented|other|fof|index)\s+schemes$/i.test(s)) return true;
  if (n === "equity schemes" || n === "debt schemes" || n === "hybrid schemes") return true;
  if (n.endsWith(" schemes") && s.split(/\s+/).length <= 4) return true;
  return false;
}

/** Standalone category labels (not fund names). */
function isCategoryOnlyLabel(cell: string): boolean {
  const s = safeTrim(cell);
  if (!s) return false;
  return /^(equity|debt|hybrid|liquid|index|fof|other)$/i.test(s);
}

/** True if this row looks like a section banner, not a fund line. */
function isCategoryBannerRow(schemeVal: string, firstCol: string): boolean {
  if (isCategorySectionRow(schemeVal)) return true;
  if (isCategoryOnlyLabel(schemeVal) || isCategoryOnlyLabel(firstCol)) return true;
  return false;
}

function isFooterRow(row: Record<string, string>, schemeCol: string): boolean {
  const scheme = safeTrim(row[schemeCol] ?? "");
  const blob = Object.values(row)
    .map((v) => String(v ?? ""))
    .join(" ")
    .toLowerCase();
  if (/^\s*note:/i.test(scheme)) return true;
  for (const v of Object.values(row)) {
    if (/^\s*note:/i.test(safeTrim(v))) return true;
  }
  if (blob.includes("past performance")) return true;
  if (blob.includes("disclaimer")) return true;
  if (scheme.toLowerCase().startsWith("disclaimer")) return true;
  return false;
}

/** Footnotes / URLs pasted into the scheme column — not a fund line; skip without ending the table. */
function isNonFundSchemeNoise(scheme: string): boolean {
  const s = safeTrim(scheme);
  if (!s) return false;
  const t = s.toLowerCase();
  if (/https?:\/\//i.test(t)) return true;
  if (/\bamfiindia\.com\b/i.test(t)) return true;
  if (/for detailed understanding/i.test(t)) return true;
  if (/click\s+on\s+the\s+below\s+link/i.test(t)) return true;
  if (/^\^?\*?\s*the\s+aum\s+figure\b/i.test(t)) return true;
  if (/\binformation\s*ratio\b/i.test(t) && /\.(com|org)\b/i.test(t)) return true;
  return false;
}

function findSchemeNameHeaderKey(headers: string[]): string | undefined {
  return headers.find((h) => {
    const n = normalizeKey(h);
    return n === "scheme name" || (n.includes("scheme") && n.includes("name"));
  });
}

/**
 * Prefer a row where a cell is exactly "Scheme Name" (report-style tables).
 * Fallback: any cell containing "scheme name" / scheme+name headers.
 */
function detectSchemeNameHeaderRowIndex(aoa: unknown[][]): number {
  for (let i = 0; i < aoa.length; i++) {
    const cells = (aoa[i] ?? []).map((c) => safeTrim(c));
    // Excel/CSV: header row is usually the line where a cell is exactly "Scheme Name" (case/spacing variants).
    if (cells.some((c) => c === "Scheme Name" || normalizeKey(c) === "scheme name")) return i;
  }
  for (let i = 0; i < aoa.length; i++) {
    const cells = (aoa[i] ?? []).map((c) => safeTrim(c));
    const hasScheme = cells.some((c) => {
      const raw = String(c).toLowerCase();
      const n = normalizeKey(c);
      if (n === "scheme name") return true;
      return raw.includes("scheme name") || (n.includes("scheme") && n.includes("name"));
    });
    if (hasScheme) return i;
  }
  return -1;
}

function aoaToNamedRows(
  aoa: unknown[][],
  headerIdx: number
): { rows: INamedRow[]; headers: string[] } {
  const headerRow = (aoa[headerIdx] ?? []) as unknown[];
  const headers = headerRow.map((h, idx) => {
    const t = safeTrim(h);
    return t.length ? t : `__col_${idx}`;
  });

  const schemeCol = findSchemeNameHeaderKey(headers);
  const rows: INamedRow[] = [];
  let sectionCategory: string | null = null;

  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const raw = (aoa[r] ?? []) as unknown[];
    const firstCol = safeTrim(raw[0] ?? "");
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = raw[c] === null || raw[c] === undefined ? "" : String(raw[c]);
    }

    if (!schemeCol) break;
    const schemeVal = safeTrim(obj[schemeCol] ?? "");
    if (!schemeVal) continue;

    if (isCategoryBannerRow(schemeVal, firstCol)) {
      if (isCategorySectionRow(schemeVal)) sectionCategory = schemeVal;
      continue;
    }

    if (isNonFundSchemeNoise(schemeVal)) continue;

    if (isFooterRow(obj as Record<string, string>, schemeCol)) break;

    const catCol = pickHeader(obj, ["category", "Category"]);
    const category =
      catCol !== undefined && catCol !== null && String(catCol).trim().length > 0
        ? String(catCol).trim()
        : sectionCategory ?? null;

    rows.push({ ...obj, __derivedCategory: category });
  }

  return { rows, headers };
}

async function fileToAoA(file: File): Promise<unknown[][]> {
  const ext = file.name.toLowerCase();
  if (ext.endsWith(".xlsx") || ext.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false }) as unknown[][];
  }
  const text = await file.text();
  const parsed = Papa.parse<unknown[]>(text, { header: false, skipEmptyLines: false });
  return (parsed.data as unknown[][]).filter((row) => Array.isArray(row) && row.some((c) => String(c ?? "").trim()));
}

function parseRowsIntoFunds(
  rows: INamedRow[],
  headers: string[],
  out: Map<string, IPerformance>,
  fixedKeys: FixedPerformanceColumnKeys | null
): void {
  for (const row of rows) {
    const keyInfo = schemeKeyFromRow(row);
    if (!keyInfo) continue;

    const categoryRaw = row.__derivedCategory ?? pickHeader(row, ["category", "Category"]);
    const category = resolveCanonicalCategory(
      categoryRaw === undefined || categoryRaw === null || String(categoryRaw).trim().length === 0
        ? null
        : String(categoryRaw).trim(),
      keyInfo.schemeName
    );

    const schemeCodeRaw =
      pickHeader(row, ["scheme_code", "Scheme Code", "scheme code"]) ?? pickHeader(row, ["amfi_code", "amfi code", "AMFI Code"]);
    const schemeCode =
      schemeCodeRaw === undefined || schemeCodeRaw === null || String(schemeCodeRaw).trim().length === 0
        ? null
        : String(schemeCodeRaw).trim();

    let benchmarkName: string | null | undefined;
    const directReturnsByHorizon: Partial<Record<ITimeframeYears, number | null>> = {};
    const benchmarkReturnsByHorizon: Partial<Record<ITimeframeYears, number | null>> = {};
    const infoRatioDirectByHorizon: Partial<Record<ITimeframeYears, number | null>> = {};

    if (fixedKeys) {
      const bn = row[fixedKeys.benchmarkKey];
      benchmarkName = bn === undefined || bn === null ? null : safeTrim(String(bn));
      for (const h of horizons) {
        directReturnsByHorizon[h] = extractNumericOrNull(row, fixedKeys.direct[h]);
        benchmarkReturnsByHorizon[h] = extractNumericOrNull(row, fixedKeys.bench[h]);
        infoRatioDirectByHorizon[h] = extractNumericOrNull(row, fixedKeys.ir[h]);
      }
    } else {
      benchmarkName =
        pickHeader(row, ["Benchmark", "benchmark", "Scheme Benchmark", "scheme benchmark"]) ??
        pickHeader(row, ["Benchmark Name"]);
      for (const h of horizons) {
        const { directHit, benchHit } = findReturnCols(headers, h);
        directReturnsByHorizon[h] = extractNumericOrNull(row, directHit);
        benchmarkReturnsByHorizon[h] = extractNumericOrNull(row, benchHit);
        const irCol = findInformationRatioDirectCol(headers, h);
        infoRatioDirectByHorizon[h] = extractNumericOrNull(row, irCol);
      }
    }

    let aumCr: number | null;
    if (fixedKeys) {
      aumCr = parseNumber(row[fixedKeys.aumKey]);
    } else {
      const aumCrRaw =
        pickHeader(row, ["Daily AUM (Cr.)", "Daily AUM", "AUM (Cr.)", "aum", "Current AUM", "Current AUM (Cr.)"]) ??
        pickHeader(row, ["AUM", "aum"]);
      aumCr = parseNumber(aumCrRaw);
    }

    const returnSinceLaunchHeader =
      fixedKeys?.returnSinceLaunchDirectBenchmarkKey ??
      findHeaderKey(headers, USER_FIXED_PERFORMANCE_HEADERS.RETURN_SINCE_LAUNCH_DIRECT_BENCHMARK);
    const returnSinceLaunchDirectBenchmarkPct = extractNumericOrNull(row, returnSinceLaunchHeader);

    out.set(keyInfo.schemeKey, {
      schemeKey: keyInfo.schemeKey,
      schemeName: keyInfo.schemeName,
      schemeCode,
      category,
      benchmarkName: benchmarkName === undefined || benchmarkName === null ? null : safeTrim(benchmarkName),
      returnsDirectByHorizon: directReturnsByHorizon,
      returnsBenchmarkByHorizon: benchmarkReturnsByHorizon,
      aumCr,
      infoRatioDirectByHorizon,
      returnSinceLaunchDirectBenchmarkPct
    });
  }
}

async function parseCsvLegacy(file: File): Promise<INamedRow[]> {
  const rows: INamedRow[] = [];
  await new Promise<void>((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      dynamicTyping: false,
      complete: (results) => {
        for (const r of results.data as any[]) rows.push(r as INamedRow);
        resolve();
      },
      error: (err) => reject(err)
    });
  });
  return rows;
}

async function parsePerformanceFileWithHeaderSearch(file: File): Promise<IPerformanceParseResult | null> {
  const aoa = await fileToAoA(file);
  if (!aoa.length) return null;
  const hi = detectSchemeNameHeaderRowIndex(aoa);
  if (hi < 0) return null;
  const { rows, headers } = aoaToNamedRows(aoa, hi);
  if (!rows.length) return null;

  const fixedKeys = tryResolveFixedPerformanceKeys(headers);
  const out = new Map<string, IPerformance>();
  parseRowsIntoFunds(rows, headers, out, fixedKeys);
  const headerMs = extractReportingDateFromSheetTop(aoa, hi);
  const rowMs = extractReportingDateMsFromRows(rows, headers);
  const reportingDateMs = maxDateMs(headerMs, rowMs);
  const rawDebugRows = rows.map((r) => ({ ...(r as Record<string, unknown>) }));
  const perfColumnParseMode: PerfColumnParseMode = fixedKeys ? "fixed_template" : "legacy_fallback";
  return { funds: out, reportingDateMs, rawDebugRows, perfColumnParseMode };
}

async function parsePerformanceFileLegacy(file: File): Promise<IPerformanceParseResult> {
  const ext = file.name.toLowerCase();
  let rows: INamedRow[] = [];
  if (ext.endsWith(".xlsx") || ext.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: null }) as INamedRow[];
  } else {
    rows = await parseCsvLegacy(file);
  }

  if (!rows.length) return { funds: new Map(), reportingDateMs: null, perfColumnParseMode: "legacy_fallback" };

  const headers = Array.from(
    new Set(rows.flatMap((r) => Object.keys(r)).map((h) => safeTrim(h)).filter((h) => h.length > 0))
  );

  const schemeCol = findSchemeNameHeaderKey(headers);
  let sectionCategory: string | null = null;
  const enriched: INamedRow[] = [];

  for (const row of rows) {
    if (!schemeCol) {
      enriched.push({ ...row, __derivedCategory: pickHeader(row, ["category", "Category"]) ?? null });
      continue;
    }
    const schemeVal = safeTrim(row[schemeCol] ?? "");
    if (!schemeVal) continue;
    const firstCol = safeTrim(String(Object.values(row)[0] ?? ""));
    if (isCategoryBannerRow(schemeVal, firstCol)) {
      if (isCategorySectionRow(schemeVal)) sectionCategory = schemeVal;
      continue;
    }
    if (isNonFundSchemeNoise(schemeVal)) continue;
    if (isFooterRow(row as Record<string, string>, schemeCol)) break;
    const catCol = pickHeader(row, ["category", "Category"]);
    const category =
      catCol !== undefined && catCol !== null && String(catCol).trim().length > 0
        ? String(catCol).trim()
        : sectionCategory ?? null;
    enriched.push({ ...row, __derivedCategory: category });
  }

  const fixedKeys = tryResolveFixedPerformanceKeys(headers);
  const out = new Map<string, IPerformance>();
  parseRowsIntoFunds(enriched, headers, out, fixedKeys);
  const reportingDateMs = extractReportingDateMsFromRows(enriched, headers);
  const rawDebugRows = enriched.map((r) => ({ ...(r as Record<string, unknown>) }));
  const perfColumnParseMode: PerfColumnParseMode = fixedKeys ? "fixed_template" : "legacy_fallback";
  return { funds: out, reportingDateMs, rawDebugRows, perfColumnParseMode };
}

export async function parsePerformanceFile(file: File): Promise<IPerformanceParseResult> {
  const searched = await parsePerformanceFileWithHeaderSearch(file);
  if (searched && searched.funds.size > 0) return searched;
  const legacy = await parsePerformanceFileLegacy(file);
  if (legacy.funds.size > 0) return legacy;
  return searched ?? legacy;
}

const PERF_EXT = /\.(csv|xlsx|xls)$/i;

/** Files that look like performance exports (case-insensitive extension). */
export function isPerformanceFileName(name: string): boolean {
  return PERF_EXT.test(name);
}

/**
 * Parse several performance CSV/XLSX files (e.g. from a folder) and merge into one map.
 * Files are processed in sorted order by path/name; duplicate scheme keys keep the **last** file's row.
 * Reporting date is the maximum across files and rows.
 */
export async function parsePerformanceFiles(files: File[]): Promise<IPerformanceParseResult> {
  const supported = files.filter((f) => isPerformanceFileName(f.name));
  supported.sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true }));
  if (!supported.length)
    return { funds: new Map(), reportingDateMs: null, perfSourceBySchemeKey: new Map(), perfColumnParseMode: undefined };

  const merged = new Map<string, IPerformance>();
  const perfSourceBySchemeKey = new Map<string, string>();
  let maxReporting: number | null = null;
  const rawDebugRows: Array<Record<string, unknown>> = [];
  let perfColumnParseMode: PerfColumnParseMode | undefined;
  for (const file of supported) {
    const label = file.webkitRelativePath || file.name;
    const { funds, reportingDateMs, rawDebugRows: raw, perfColumnParseMode: mode } = await parsePerformanceFile(file);
    if (mode) {
      if (perfColumnParseMode === undefined) perfColumnParseMode = mode;
      else if (perfColumnParseMode !== mode) perfColumnParseMode = "legacy_fallback";
    }
    for (const [k, v] of funds) {
      merged.set(k, v);
      perfSourceBySchemeKey.set(k, label);
    }
    if (reportingDateMs !== null && (maxReporting === null || reportingDateMs > maxReporting)) maxReporting = reportingDateMs;
    if (raw?.length) rawDebugRows.push(...raw.map((row) => ({ ...row, _sourceFile: file.name })));
  }
  return { funds: merged, reportingDateMs: maxReporting, rawDebugRows, perfSourceBySchemeKey, perfColumnParseMode };
}
