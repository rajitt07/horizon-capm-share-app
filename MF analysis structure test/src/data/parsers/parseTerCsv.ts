import Papa from "papaparse";
import type { ITer } from "../types";
import { generateUniversalKey, normalizeKey, parseDateToMs, parseNumber, safeTrim } from "../utils";
import type { TerColumnParseMode } from "./fixedUploadColumnResolve";
import { tryResolveFixedTerKeys } from "./fixedUploadColumnResolve";

function pickHeader(row: Record<string, any>, wanted: string[]): any {
  for (const w of wanted) {
    const hit = Object.keys(row).find((k) => normalizeKey(k) === normalizeKey(w));
    if (hit) return row[hit];
  }
  return undefined;
}

function schemeKeyFromRow(row: Record<string, any>): { schemeKey: string; schemeName: string } | null {
  const schemeCode = pickHeader(row, [
    "scheme_code",
    "Scheme Code",
    "scheme code",
    "amfi_code",
    "amfi code",
    "NSDL Scheme Code"
  ]);
  const schemeName = pickHeader(row, ["scheme_name", "Scheme Name", "scheme name", "Scheme", "scheme"]);
  const keyRaw = schemeName ?? schemeCode;
  if (keyRaw === undefined || keyRaw === null || String(keyRaw).trim().length === 0) return null;
  const schemeNameStr = String(schemeName ?? keyRaw).trim();
  const codeStr = schemeCode !== undefined && schemeCode !== null ? String(schemeCode).trim() : "";
  if (codeStr.length > 0) {
    return { schemeKey: normalizeKey(codeStr), schemeName: schemeNameStr };
  }
  return { schemeKey: generateUniversalKey(schemeNameStr), schemeName: schemeNameStr };
}

/** Canonical AMFI-style column for direct plan total TER (exact match on normalized header). */
export const TER_DIRECT_PLAN_TOTAL_PCT_HEADER = "Direct Plan - Total TER (%)";

function findTerHeaderPreferred(headers: string[]): string | undefined {
  const want = normalizeKey(TER_DIRECT_PLAN_TOTAL_PCT_HEADER);
  return headers.find((h) => normalizeKey(h) === want);
}

/** Used when the preferred column is missing (legacy / alternate exports). */
function detectTerDirectHeaderFallback(headers: string[]): string | undefined {
  const normalized = headers.map((h) => ({ h, n: normalizeKey(h) }));
  const directTer = normalized.find((x) => x.n.includes("ter") && x.n.includes("direct") && x.n.includes("%"))?.h;
  if (directTer) return directTer;
  const directTer2 = normalized.find((x) => x.n.includes("direct") && x.n.includes("expense ratio"))?.h;
  if (directTer2) return directTer2;
  return normalized.find((x) => x.n.includes("ter") && x.n.includes("%"))?.h;
}

function resolveTerDirectHeader(headers: string[]): string | undefined {
  return findTerHeaderPreferred(headers) ?? detectTerDirectHeaderFallback(headers);
}

export interface ITerParseResult {
  terByKey: Map<string, ITer>;
  reportingDateMs: number | null;
  /** User template headers matched exactly vs legacy fuzzy column detection. */
  terColumnParseMode?: TerColumnParseMode;
}

function extractReportingDateFromTer(headers: string[], rows: Record<string, any>[]): number | null {
  const dateHeader = headers.find((h) => {
    const n = normalizeKey(h);
    if (/scheme|name|ter|code|isin|benchmark/i.test(n)) return false;
    return /as on|reporting|effective|snapshot|period end|valuation|date/i.test(n);
  });
  if (!dateHeader) return null;
  let maxMs: number | null = null;
  for (const row of rows) {
    const ms = parseDateToMs(row[dateHeader]);
    if (ms !== null && (maxMs === null || ms > maxMs)) maxMs = ms;
  }
  return maxMs;
}

export async function parseTerCsv(file: File): Promise<ITerParseResult> {
  const ext = file.name.toLowerCase();
  if (!ext.endsWith(".csv")) {
    throw new Error("TER file must be a .csv in this demo build.");
  }

  const rows: Record<string, any>[] = [];
  await new Promise<void>((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      dynamicTyping: false,
      complete: (results) => {
        for (const r of results.data as any[]) rows.push(r as Record<string, any>);
        resolve();
      },
      error: (err) => reject(err)
    });
  });

  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const fixedTer = tryResolveFixedTerKeys(headers);
  const terHeader = fixedTer ? fixedTer.terKey : resolveTerDirectHeader(headers);
  const out = new Map<string, ITer>();

  if (fixedTer) {
    for (const row of rows) {
      const schemeNameStr = safeTrim(row[fixedTer.schemeNameKey] ?? "");
      if (!schemeNameStr) continue;
      const nameKey = generateUniversalKey(schemeNameStr);
      const terDirectPct = parseNumber(row[fixedTer.terKey]);
      const terRow: ITer = { schemeKey: nameKey, schemeName: schemeNameStr, terDirectPct };
      out.set(nameKey, terRow);
      const codeStr = safeTrim(row[fixedTer.nsdlKey] ?? "");
      if (codeStr.length > 0) {
        const codeKey = normalizeKey(codeStr);
        if (codeKey !== nameKey) out.set(codeKey, terRow);
      }
    }
  } else {
    for (const row of rows) {
      const keyInfo = schemeKeyFromRow(row);
      if (!keyInfo) continue;
      const terDirectPct = terHeader ? parseNumber(row[terHeader]) : null;
      out.set(keyInfo.schemeKey, {
        schemeKey: keyInfo.schemeKey,
        schemeName: keyInfo.schemeName,
        terDirectPct
      });
    }
  }

  const reportingDateMs = extractReportingDateFromTer(headers, rows);
  const terColumnParseMode: TerColumnParseMode = fixedTer ? "fixed_template" : "legacy_fallback";
  return { terByKey: out, reportingDateMs, terColumnParseMode };
}

