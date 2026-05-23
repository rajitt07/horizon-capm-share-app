// Parses 16Sectoral Deployment of Credit (selected banks).csv
// Row layout (0-indexed from raw CSV rows):
//   Row 6  → header row: cols 3..N are date strings
//   Row 7  → I.   Gross Bank Credit
//   Row 9  → II.  Food Credit
//   Row 10 → III. Non-food Credit
//   Row 12 → 1.   Agriculture & Allied Activities
//   Row 13 → 2.   Industry
//   Row 15 → 2.1  Micro and Small
//   Row 16 → 2.2  Medium
//   Row 17 → 2.3  Large
//   Row 18 → 3.   Services
//   Row 20 → 3.1  Transport Operators
//   Row 21 → 3.2  Computer Software
//   Row 22 → 3.3  Tourism, Hotels & Restaurants
//   Row 23 → 3.4  Shipping
//   Row 24 → 3.5  Aviation
//   Row 25 → 3.6  Professional Services
//   Row 26 → 3.7  Trade
//   Row 27 → 3.7.1 Wholesale Trade
//   Row 28 → 3.7.2 Retail Trade
//   Row 29 → 3.8  Commercial Real Estate
//   Row 31 → 3.9  NBFCs
//   Row 34 → 3.10 Other Services
//   Row 36 → 4.   Personal Loans
//   Row 38 → 4.1  Consumer Durables
//   Row 39 → 4.2  Housing
//   Row 41 → 4.3  Advances against Fixed Deposits
//   Row 42 → 4.4  Advances against Shares & Bonds
//   Row 43 → 4.5  Credit Card Outstanding
//   Row 44 → 4.6  Education
//   Row 45 → 4.7  Vehicle Loans
//   Row 46 → 4.8  Loan against Gold Jewellery
//   Row 47 → 4.9  Other Personal Loans
//   Row 49 → 5.   Priority Sector (Memo)
//   Row 50 → 5.1  Agriculture (Priority)
//   Row 51 → 5.2  Micro & Small Enterprises
//   Row 52 → 5.3  Medium Enterprises
//   Row 53 → 5.4  Housing (Priority)
//   Row 55 → 5.5  Education Loans
//   Row 56 → 5.6  Renewable Energy
//   Row 57 → 5.7  Social Infrastructure
//   Row 58 → 5.8  Export Credit
//   Row 59 → 5.9  Others

export type CreditSector = {
  id: string
  label: string
  group: string
  rowIndex: number
}

export type CreditSeriesPoint = {
  period: string
  value: number
}

export type ParsedCreditData = {
  sectors: CreditSector[]
  seriesBySectorId: Record<string, CreditSeriesPoint[]>
}

// All sectors user can select, grouped by the MF thematic category they benefit.
// Sub-sectors that benefit multiple MF categories appear once per category with a unique id.
// rowIndex values are 0-based indices into the raw CSV — never changes.
export const CREDIT_SECTORS: CreditSector[] = [
  // ── Rural ────────────────────────────────────────────────────────────────
  { id: "agriculture",              label: "Agriculture & Allied Activities",   group: "Rural",                    rowIndex: 12 },
  { id: "ps_agriculture",           label: "Agriculture (Priority Sector)",     group: "Rural",                    rowIndex: 50 },

  // ── Small Cap ─────────────────────────────────────────────────────────────
  { id: "micro_small",              label: "Micro and Small",                   group: "Small Cap",                rowIndex: 15 },
  { id: "ps_micro_small",          label: "Micro & Small Enterprises (PS)",    group: "Small Cap",                rowIndex: 51 },

  // ── Mid Cap ───────────────────────────────────────────────────────────────
  { id: "medium",                   label: "Medium",                            group: "Mid Cap",                  rowIndex: 16 },
  { id: "ps_medium",                label: "Medium Enterprises (PS)",           group: "Mid Cap",                  rowIndex: 52 },

  // ── Large Cap ─────────────────────────────────────────────────────────────
  { id: "large",                    label: "Large",                             group: "Large Cap",                rowIndex: 17 },

  // ── Technology ────────────────────────────────────────────────────────────
  { id: "computer_sw",              label: "Computer Software",                 group: "Technology",               rowIndex: 21 },

  // ── Transportation & Logistics ────────────────────────────────────────────
  { id: "transport",                label: "Transport Operators",               group: "Transportation",           rowIndex: 20 },
  { id: "shipping",                 label: "Shipping",                          group: "Transportation",           rowIndex: 23 },
  { id: "aviation",                 label: "Aviation",                          group: "Transportation",           rowIndex: 24 },
  { id: "vehicle_loans",            label: "Vehicle Loans",                     group: "Transportation",           rowIndex: 45 },

  // ── Consumption ───────────────────────────────────────────────────────────
  { id: "tourism",                  label: "Tourism, Hotels & Restaurants",     group: "Consumption",              rowIndex: 22 },
  { id: "trade",                    label: "Trade",                             group: "Consumption",              rowIndex: 26 },
  { id: "consumer_durables",        label: "Consumer Durables",                 group: "Consumption",              rowIndex: 38 },
  { id: "credit_cards_con",         label: "Credit Card Outstanding",           group: "Consumption",              rowIndex: 43 },
  { id: "other_personal",           label: "Other Personal Loans",              group: "Consumption",              rowIndex: 47 },

  // ── Real Estate ───────────────────────────────────────────────────────────
  { id: "comm_real_estate",         label: "Commercial Real Estate",            group: "Real Estate",              rowIndex: 29 },
  { id: "housing_re",               label: "Housing",                           group: "Real Estate",              rowIndex: 39 },
  { id: "ps_housing_re",            label: "Housing (Priority Sector)",         group: "Real Estate",              rowIndex: 53 },

  // ── Infrastructure ────────────────────────────────────────────────────────
  { id: "comm_real_estate_infra",   label: "Commercial Real Estate",            group: "Infrastructure",           rowIndex: 29 },
  { id: "housing_infra",            label: "Housing",                           group: "Infrastructure",           rowIndex: 39 },
  { id: "ps_housing_infra",         label: "Housing (Priority Sector)",         group: "Infrastructure",           rowIndex: 53 },
  { id: "ps_social_infra",          label: "Social Infrastructure",             group: "Infrastructure",           rowIndex: 57 },

  // ── Financial Services ────────────────────────────────────────────────────
  { id: "nbfcs",                    label: "NBFCs",                             group: "Financial Services",       rowIndex: 31 },
  { id: "shares_bonds",             label: "Advances against Shares & Bonds",   group: "Financial Services",       rowIndex: 42 },
  { id: "credit_cards_fs",          label: "Credit Card Outstanding",           group: "Financial Services",       rowIndex: 43 },

  // ── Finance (Banking) ─────────────────────────────────────────────────────
  { id: "fixed_deposits",           label: "Advances against Fixed Deposits",   group: "Finance (Banking)",        rowIndex: 41 },
  { id: "housing_bank",             label: "Housing",                           group: "Finance (Banking)",        rowIndex: 39 },
  { id: "ps_housing_bank",          label: "Housing (Priority Sector)",         group: "Finance (Banking)",        rowIndex: 53 },

  // ── Gold ──────────────────────────────────────────────────────────────────
  { id: "gold_jewellery",           label: "Loan against Gold Jewellery",       group: "Gold",                     rowIndex: 46 },

  // ── ESG ───────────────────────────────────────────────────────────────────
  { id: "education",                label: "Education",                         group: "ESG",                      rowIndex: 44 },
  { id: "ps_education",             label: "Education Loans (PS)",              group: "ESG",                      rowIndex: 55 },
  { id: "ps_renewable_esg",         label: "Renewable Energy",                  group: "ESG",                      rowIndex: 56 },
  { id: "ps_social_infra_esg",      label: "Social Infrastructure",             group: "ESG",                      rowIndex: 57 },

  // ── Energy ────────────────────────────────────────────────────────────────
  { id: "ps_renewable",             label: "Renewable Energy",                  group: "Energy",                   rowIndex: 56 },

  // ── Export / International ────────────────────────────────────────────────
  { id: "ps_export",                label: "Export Credit",                     group: "Export / Intl",            rowIndex: 58 },

  // ── Flexi Cap ─────────────────────────────────────────────────────────────
  { id: "other_personal_fc",        label: "Other Personal Loans",              group: "Flexi Cap",                rowIndex: 47 },
  { id: "ps_others",                label: "Others (Priority Sector)",          group: "Flexi Cap",                rowIndex: 59 },

  // ── Others / Diversified ──────────────────────────────────────────────────
  { id: "prof_services",            label: "Professional Services",             group: "Others / Diversified",     rowIndex: 25 },
  { id: "other_services",           label: "Other Services",                    group: "Others / Diversified",     rowIndex: 34 },
]

// ─── Row-index sets for new-sector detection ─────────────────────────────────
// All row indices already mapped in CREDIT_SECTORS (unique by rowIndex)
const KNOWN_ROW_INDICES = new Set<number>(
  CREDIT_SECTORS.map((s) => s.rowIndex)
)

// Aggregate / header / sub-sub-sector rows we intentionally skip so they
// don't show up in the "new sectors detected" panel for the user.
const SKIP_ROW_INDICES = new Set<number>([
  7,   // Gross Bank Credit (aggregate)
  9,   // Food Credit (aggregate)
  10,  // Non-food Credit (aggregate)
  13,  // Industry — aggregate of 2.1/2.2/2.3
  14,  // Industry revised-series row
  18,  // Services — aggregate
  19,  // Services revised-series row
  27,  // Wholesale Trade (sub-sub of Trade)
  28,  // Retail Trade (sub-sub of Trade)
  30,  // Commercial Real Estate revised-series row
  32,  // HFCs (sub-sub of NBFCs)
  33,  // PFIs (sub-sub of NBFCs)
  35,  // Other Services revised-series row
  36,  // Personal Loans — aggregate
  37,  // Personal Loans revised-series row
  40,  // Housing revised-series row
  48,  // Other Personal Loans revised-series row
  49,  // Priority Sector — aggregate/memo (no data values)
  54,  // Housing (Priority) revised-series row
  60,  // Weaker Sections (sub-sector of Priority)
  61,  // blank
])

/** A sector row found in the uploaded CSV that isn't in the hardcoded CREDIT_SECTORS list. */
export type DetectedSector = {
  rowIndex: number
  serialNo: string
  label: string
  /** First 3 numeric values for display preview */
  previewValues: number[]
}

/**
 * Scans the raw CSV text for sector rows that are NOT already in CREDIT_SECTORS.
 * Returns them so the user can assign them to MF categories.
 */
export function scanForNewSectors(text: string): DetectedSector[] {
  const rows = parseCSVRows(text)
  const dateRow = rows[6] ?? []
  const maxDataCols = dateRow.filter((c) => c.trim()).length

  const result: DetectedSector[] = []

  for (let i = 7; i < rows.length; i++) {
    if (KNOWN_ROW_INDICES.has(i) || SKIP_ROW_INDICES.has(i)) continue

    const row = rows[i]
    if (!row || row.length < 4) continue

    const serialNo = row[1]?.trim() ?? ""
    const label = row[2]?.trim() ?? ""

    // Must have a serial-number-like value in col 1 and meaningful label in col 2
    if (!serialNo || !label) continue
    if (label.length > 150) continue                              // notes/source rows
    if (/^(Notes|Source|Also)/i.test(label)) continue

    // Must have meaningful numeric data
    const numericVals: number[] = []
    for (let c = 3; c < Math.min(row.length, 3 + maxDataCols); c++) {
      const n = parseFloat(row[c]?.trim() ?? "")
      if (isFinite(n)) numericVals.push(n)
    }
    if (numericVals.length < 5) continue

    result.push({ rowIndex: i, serialNo, label, previewValues: numericVals.slice(0, 3) })
  }

  return result
}

/**
 * Parses time-series data for an arbitrary list of sectors (used for user-assigned
 * new sectors after the assignment panel is completed).
 */
export function parseExtraSectors(
  text: string,
  sectors: CreditSector[],
): Record<string, CreditSeriesPoint[]> {
  const rows = parseCSVRows(text)
  const dateRow = rows[6] ?? []
  const periods: string[] = []
  for (let c = 3; c < dateRow.length; c++) {
    const d = dateRow[c]?.trim() ?? ""
    if (d) periods.push(normaliseDate(d))
  }

  const result: Record<string, CreditSeriesPoint[]> = {}
  for (const sector of sectors) {
    const row = rows[sector.rowIndex]
    if (!row) { result[sector.id] = []; continue }
    const points: CreditSeriesPoint[] = []
    for (let c = 3; c < row.length && c - 3 < periods.length; c++) {
      const val = parseFloatLoose(row[c] ?? "")
      if (val !== null) points.push({ period: periods[c - 3], value: val })
    }
    result[sector.id] = points
  }
  return result
}

function parseFloatLoose(s: string): number | null {
  // Strip commas to handle both plain decimals (366705.18) and
  // Indian-format numbers ("3,66,705" or "3,66,705.18") from newer RBI exports.
  const trimmed = s.trim().replace(/,/g, "")
  if (!trimmed) return null
  const n = parseFloat(trimmed)
  return isFinite(n) ? n : null
}

function normaliseDate(raw: string): string {
  // "January  18, 2019" → "2019-01-18"
  const clean = raw.replace(/\s+/g, " ").trim()
  const d = new Date(clean)
  if (!isNaN(d.getTime())) {
    const yr = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, "0")
    const dy = String(d.getDate()).padStart(2, "0")
    return `${yr}-${mo}-${dy}`
  }
  return clean
}

export async function fetchAndParseCreditCsv(): Promise<ParsedCreditData> {
  const resp = await fetch("/data/credit_sectoral.csv")
  if (!resp.ok) throw new Error(`Failed to fetch credit CSV: ${resp.status}`)
  const text = await resp.text()
  return parseCreditCsvText(text)
}

export function parseCreditCsvText(text: string): ParsedCreditData {
  // Split into rows, each row split by comma — but some cells have quoted commas.
  // Use a simple RFC4180-ish parser.
  const rows = parseCSVRows(text)

  // Row index 6 (0-based) = date header row; cols 3..N
  const dateRow = rows[6] ?? []
  const periods: string[] = []
  for (let c = 3; c < dateRow.length; c++) {
    const d = dateRow[c]?.trim() ?? ""
    if (d) periods.push(normaliseDate(d))
  }

  const seriesBySectorId: Record<string, CreditSeriesPoint[]> = {}

  for (const sector of CREDIT_SECTORS) {
    const row = rows[sector.rowIndex]
    if (!row) {
      seriesBySectorId[sector.id] = []
      continue
    }
    const points: CreditSeriesPoint[] = []
    for (let c = 3; c < row.length && c - 3 < periods.length; c++) {
      const val = parseFloatLoose(row[c] ?? "")
      if (val !== null) {
        points.push({ period: periods[c - 3], value: val })
      }
    }
    seriesBySectorId[sector.id] = points
  }

  return { sectors: CREDIT_SECTORS, seriesBySectorId }
}

// Minimal RFC4180 CSV row parser
function parseCSVRows(text: string): string[][] {
  const rows: string[][] = []
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    rows.push(splitCSVLine(line))
  }
  return rows
}

function splitCSVLine(line: string): string[] {
  const cells: string[] = []
  let cur = ""
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuote = !inQuote
      }
    } else if (ch === "," && !inQuote) {
      cells.push(cur)
      cur = ""
    } else {
      cur += ch
    }
  }
  cells.push(cur)
  return cells
}
