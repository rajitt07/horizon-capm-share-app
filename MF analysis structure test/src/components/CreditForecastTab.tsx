import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  CREDIT_SECTORS,
  parseCreditCsvText,
  parseExtraSectors,
  scanForNewSectors,
  type CreditSector,
  type DetectedSector,
  type ParsedCreditData,
} from "../lib/parseCreditCsv"
import {
  hwForecast,
  DEFAULT_HW_CONSTRAINTS,
  type HwConstraints,
  type HwForecastResult,
} from "../lib/holtwinters"
import CreditHwConstraintsPanel from "./CreditHwConstraintsPanel"
import CreditForecastChart from "./CreditForecastChart"

// ─── MF category colours ─────────────────────────────────────────────────────
const GROUP_COLORS: Record<string, string> = {
  "Rural":                 "#34d399",
  "Small Cap":             "#60a5fa",
  "Mid Cap":               "#818cf8",
  "Large Cap":             "#a78bfa",
  "Technology":            "#22d3ee",
  "Transportation":        "#fb923c",
  "Consumption":           "#f59e0b",
  "Real Estate":           "#f87171",
  "Infrastructure":        "#4ade80",
  "Financial Services":    "#e879f9",
  "Finance (Banking)":     "#c084fc",
  "Gold":                  "#fbbf24",
  "ESG":                   "#86efac",
  "Energy":                "#facc15",
  "Export / Intl":         "#38bdf8",
  "Flexi Cap":             "#94a3b8",
  "Others / Diversified":  "#64748b",
}

function groupColor(group: string): string {
  return GROUP_COLORS[group] ?? "#94a3b8"
}

// ─── HW helpers ──────────────────────────────────────────────────────────────
const DEFAULT_M = 12

function runHw(
  sectorId: string,
  data: ParsedCreditData,
  constraints: HwConstraints,
): HwForecastResult | null {
  const pts = data.seriesBySectorId[sectorId]
  if (!pts?.length) return null
  return hwForecast(
    pts.map((p) => p.period),
    pts.map((p) => p.value),
    { m: DEFAULT_M, forecastSteps: DEFAULT_M, constraints },
  )
}

// ─── All MF category names (for the assignment panel dropdown) ────────────────
const MF_CATEGORIES = Array.from(new Set(CREDIT_SECTORS.map((s) => s.group)))

// ─── Metric pill ─────────────────────────────────────────────────────────────
function MetricPill({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 min-w-[90px]">
      <span className="font-mono text-[10px] font-bold tracking-[0.2em] text-white/40 uppercase">{label}</span>
      <span
        className="mt-0.5 font-mono text-[15px] font-semibold"
        style={{ color: good === undefined ? "#e2e8f0" : good ? "#34d399" : "#f87171" }}
      >
        {value}
      </span>
    </div>
  )
}

// ─── Upload zone ─────────────────────────────────────────────────────────────
function UploadZone({ onFile, fileName }: { onFile: (f: File) => void; fileName?: string }) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDrag(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }, [onFile])

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-10 py-14 text-center transition-colors ${
        drag
          ? "border-emerald-400/60 bg-emerald-400/5"
          : "border-white/[0.1] bg-white/[0.02] hover:border-white/20"
      }`}
    >
      {/* Upload icon */}
      <svg className="mb-4 text-white/25" width="40" height="40" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>

      <p className="text-[13px] font-semibold text-white/70">
        {fileName ? `Loaded: ${fileName}` : "Drop the RBI Credit CSV here"}
      </p>
      <p className="mt-1 text-[11px] text-white/30">
        16 Sectoral Deployment of Credit (Selected Banks).csv
      </p>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mt-5 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-5 py-2 font-mono text-[11px] font-semibold tracking-[0.14em] text-emerald-400 transition-colors hover:border-emerald-400 hover:bg-emerald-500/20"
      >
        {fileName ? "REPLACE FILE" : "CHOOSE FILE"}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }}
      />
    </div>
  )
}

// ─── Assignment panel (new sectors) ──────────────────────────────────────────
type Assignments = Record<number, string[]>  // rowIndex → list of MF categories

function AssignmentPanel({
  newSectors,
  assignments,
  onChange,
  onApply,
  onSkipAll,
}: {
  newSectors: DetectedSector[]
  assignments: Assignments
  onChange: (rowIndex: number, cats: string[]) => void
  onApply: () => void
  onSkipAll: () => void
}) {
  const allSkipped = newSectors.every((s) => !assignments[s.rowIndex]?.length)

  return (
    <div className="flex flex-col gap-0 overflow-y-auto" style={{ height: "100%" }}>
      {/* Header */}
      <div className="shrink-0 border-b border-white/[0.06] bg-black/60 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[9px] font-bold tracking-[0.26em] text-amber-400/80 uppercase">
              New Sectors Detected
            </div>
            <h2 className="mt-0.5 text-[15px] font-semibold text-white">
              {newSectors.length} new sub-sector{newSectors.length !== 1 ? "s" : ""} found in the uploaded file
            </h2>
            <p className="mt-1 text-[11px] text-white/40 max-w-xl">
              Assign each to one or more MF categories so they appear in the forecast view. Unassigned sectors will be skipped.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onSkipAll}
              className="rounded-full border border-white/[0.12] px-4 py-1.5 font-mono text-[10px] font-semibold tracking-[0.14em] text-white/50 transition-colors hover:border-white/25 hover:text-white"
            >
              SKIP ALL
            </button>
            <button
              type="button"
              onClick={onApply}
              className="rounded-full border border-emerald-500 bg-emerald-500/15 px-5 py-1.5 font-mono text-[10px] font-semibold tracking-[0.14em] text-emerald-400 transition-colors hover:bg-emerald-500/25"
            >
              {allSkipped ? "SKIP ALL & FORECAST" : "APPLY & FORECAST"}
            </button>
          </div>
        </div>
      </div>

      {/* Sector rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-white/[0.05] px-6">
        {newSectors.map((sector) => {
          const selected = assignments[sector.rowIndex] ?? []
          return (
            <div key={sector.rowIndex} className="py-4">
              <div className="flex items-start gap-4">
                {/* Sector info */}
                <div className="w-[260px] shrink-0">
                  <div className="font-mono text-[9px] font-bold tracking-[0.2em] text-white/30 uppercase">
                    Row {sector.rowIndex} · {sector.serialNo}
                  </div>
                  <div className="mt-0.5 text-[13px] font-semibold text-white">{sector.label}</div>
                  <div className="mt-1 font-mono text-[10px] text-white/30">
                    Preview: ₹{sector.previewValues.map((v) =>
                      v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)
                    ).join(" · ")} Cr
                  </div>
                </div>

                {/* Category toggles */}
                <div className="flex flex-wrap gap-1.5">
                  {MF_CATEGORIES.map((cat) => {
                    const active = selected.includes(cat)
                    const color = groupColor(cat)
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          onChange(
                            sector.rowIndex,
                            active ? selected.filter((c) => c !== cat) : [...selected, cat],
                          )
                        }}
                        className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] transition-colors ${
                          active ? "text-black" : "border-white/[0.1] text-white/40 hover:text-white/70"
                        }`}
                        style={
                          active
                            ? { background: color, borderColor: color }
                            : {}
                        }
                      >
                        {cat}
                      </button>
                    )
                  })}
                  {selected.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onChange(sector.rowIndex, [])}
                      className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[10px] text-white/30 hover:text-white/60 transition-colors"
                    >
                      clear
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
type LoadStage = "idle" | "parsing" | "assigning" | "ready"

export default function CreditForecastTab() {
  // ── Upload / parse states
  const [loadStage, setLoadStage]     = useState<LoadStage>("idle")
  const [fileName, setFileName]       = useState<string | undefined>()
  const [rawText, setRawText]         = useState<string | null>(null)
  const [loadErr, setLoadErr]         = useState<string | null>(null)
  const [data, setData]               = useState<ParsedCreditData | null>(null)
  const [newSectors, setNewSectors]   = useState<DetectedSector[]>([])
  const [assignments, setAssignments] = useState<Assignments>({})

  // ── Merged sector list (CREDIT_SECTORS + user-assigned new ones)
  const [mergedSectors, setMergedSectors] = useState<CreditSector[]>(CREDIT_SECTORS)

  // ── Forecast states
  const GROUPS = useMemo(() => Array.from(new Set(mergedSectors.map((s) => s.group))), [mergedSectors])
  const [selectedGroup, setSelectedGroup] = useState<string>(GROUPS[0] ?? "Rural")
  const [selectedId, setSelectedId]       = useState<string>(
    mergedSectors.find((s) => s.group === (GROUPS[0] ?? "Rural"))?.id ?? mergedSectors[0]?.id ?? ""
  )
  const [constraints, setConstraints]   = useState<HwConstraints>(DEFAULT_HW_CONSTRAINTS)
  const [hwResult, setHwResult]         = useState<HwForecastResult | null>(null)
  const [hwError, setHwError]           = useState<string | null>(null)
  const [computing, setComputing]       = useState(false)

  // ── File read handler
  const handleFile = useCallback((file: File) => {
    setFileName(file.name)
    setLoadErr(null)
    setLoadStage("parsing")

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      if (!text) {
        setLoadErr("Could not read file content.")
        setLoadStage("idle")
        return
      }
      try {
        const parsed = parseCreditCsvText(text)
        const detected = scanForNewSectors(text)
        setData(parsed)
        setRawText(text)
        setNewSectors(detected)
        setAssignments({})
        if (detected.length > 0) {
          setLoadStage("assigning")
        } else {
          setMergedSectors(CREDIT_SECTORS)
          setLoadStage("ready")
        }
      } catch (err) {
        setLoadErr(String((err as Error)?.message ?? err))
        setLoadStage("idle")
      }
    }
    reader.onerror = () => {
      setLoadErr("FileReader error. Try again.")
      setLoadStage("idle")
    }
    reader.readAsText(file)
  }, [])

  // ── Apply assignments from panel
  const handleApplyAssignments = useCallback(() => {
    if (!data || !rawText) return

    // Build new CreditSector entries for assigned rows
    const extraSectorDefs: CreditSector[] = []
    for (const sector of newSectors) {
      const cats = assignments[sector.rowIndex] ?? []
      for (const cat of cats) {
        extraSectorDefs.push({
          id: `new_${sector.rowIndex}_${cat.replace(/[^a-z0-9]/gi, "_").toLowerCase()}`,
          label: sector.label,
          group: cat,
          rowIndex: sector.rowIndex,
        })
      }
    }

    // Parse time-series for the extra sectors
    const extraData = extraSectorDefs.length > 0
      ? parseExtraSectors(rawText, extraSectorDefs)
      : {}

    // Merge series data
    const mergedData: ParsedCreditData = {
      sectors: [...CREDIT_SECTORS, ...extraSectorDefs],
      seriesBySectorId: { ...data.seriesBySectorId, ...extraData },
    }

    setData(mergedData)
    setMergedSectors(mergedData.sectors)
    setLoadStage("ready")
  }, [data, rawText, newSectors, assignments])

  // ── When group changes reset selected sector
  const prevGroupRef = useRef(selectedGroup)
  useEffect(() => {
    if (selectedGroup !== prevGroupRef.current) {
      prevGroupRef.current = selectedGroup
      const first = mergedSectors.find((s) => s.group === selectedGroup)
      setSelectedId(first?.id ?? "")
      setHwResult(null)
      setHwError(null)
    }
  }, [selectedGroup, mergedSectors])

  // ── Run HW whenever sector / constraints / data change
  useEffect(() => {
    if (!data || !selectedId || loadStage !== "ready") return
    setComputing(true)
    setHwError(null)
    const tid = window.setTimeout(() => {
      try {
        const result = runHw(selectedId, data, constraints)
        if (!result) {
          setHwError("Not enough data for the selected parameters. Try reducing m or holdout.")
          setHwResult(null)
        } else {
          setHwResult(result)
        }
      } catch (e) {
        setHwError(String((e as Error)?.message ?? e))
        setHwResult(null)
      }
      setComputing(false)
    }, 30)
    return () => window.clearTimeout(tid)
  }, [data, selectedId, constraints, loadStage])

  const sectorsInGroup = useMemo(
    () => mergedSectors.filter((s) => s.group === selectedGroup),
    [mergedSectors, selectedGroup],
  )

  const selectedSector = mergedSectors.find((s) => s.id === selectedId)
  const seriesPoints   = data?.seriesBySectorId[selectedId] ?? []

  const acc           = hwResult?.accuracy
  const overallAccPct = acc?.overall_accuracy_pct
  const mape          = acc?.mape_pct
  const mae           = acc?.mae
  const rmse          = acc?.rmse

  // ── IDLE — show upload zone
  if (loadStage === "idle") {
    return (
      <div className="flex flex-col items-center justify-center gap-6 p-10" style={{ minHeight: 500 }}>
        <div className="text-center">
          <div className="font-mono text-[9px] font-bold tracking-[0.3em] text-emerald-400/70 uppercase">
            Holt-Winters Forecast
          </div>
          <h2 className="mt-1 text-lg font-semibold text-white">Sectoral Bank Credit</h2>
          <p className="mt-2 text-[12px] text-white/35 max-w-md">
            Upload the latest RBI sectoral credit CSV to run Holt-Winters forecasts across all MF-linked sub-sectors.
          </p>
        </div>
        <div className="w-full max-w-md">
          <UploadZone onFile={handleFile} />
        </div>
        {loadErr && (
          <p className="rounded-lg border border-red-500/30 bg-red-950/20 px-4 py-2 font-mono text-[11px] text-red-400">
            {loadErr}
          </p>
        )}
      </div>
    )
  }

  // ── PARSING — spinner
  if (loadStage === "parsing") {
    return (
      <div className="flex flex-col items-center justify-center gap-3" style={{ minHeight: 500 }}>
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-500" />
        <span className="font-mono text-[11px] text-white/40">Parsing {fileName}…</span>
      </div>
    )
  }

  // ── ASSIGNING — new sector assignment panel
  if (loadStage === "assigning") {
    return (
      <div style={{ height: "100%" }}>
        <AssignmentPanel
          newSectors={newSectors}
          assignments={assignments}
          onChange={(rowIndex, cats) =>
            setAssignments((prev) => ({ ...prev, [rowIndex]: cats }))
          }
          onApply={handleApplyAssignments}
          onSkipAll={() => {
            setAssignments({})
            setMergedSectors(CREDIT_SECTORS)
            setLoadStage("ready")
          }}
        />
      </div>
    )
  }

  // ── READY — normal forecast UI
  return (
    <div className="flex flex-col overflow-y-auto bg-black" style={{ height: "100%" }}>
      {/* ── Top Controls Row ─────────────────────────────────────── */}
      <div className="sticky top-0 z-10 shrink-0 border-b border-white/[0.06] bg-[rgba(0,0,0,0.92)] px-5 py-3 backdrop-blur">
        <div className="mx-auto max-w-[1600px] flex flex-wrap items-center gap-3">
          {/* Title + re-upload */}
          <div className="flex flex-col">
            <span className="font-mono text-[9px] font-bold tracking-[0.26em] text-emerald-400/70 uppercase">
              Holt-Winters Forecast
            </span>
            <span className="text-sm font-semibold text-white/90">Sectoral Bank Credit</span>
          </div>

          {/* File badge + re-upload */}
          <div className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" className="text-white/30">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
              <polyline points="13 2 13 9 20 9"/>
            </svg>
            <span className="font-mono text-[9px] text-white/40 max-w-[180px] truncate">{fileName}</span>
            <button
              type="button"
              onClick={() => { setLoadStage("idle"); setData(null); setHwResult(null) }}
              className="ml-1 font-mono text-[9px] text-white/30 hover:text-emerald-400 transition-colors"
              title="Upload a new file"
            >
              ↑ replace
            </button>
          </div>

          <div className="h-5 w-px bg-white/[0.07]" />

          {/* Group pills */}
          <div className="flex flex-wrap gap-1">
            {GROUPS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setSelectedGroup(g)}
                className={`rounded-full border px-3 py-1 text-[10px] font-semibold tracking-[0.1em] transition-colors ${
                  selectedGroup === g
                    ? "border-transparent text-black"
                    : "border-white/[0.1] text-white/60 hover:border-white/25 hover:text-white"
                }`}
                style={selectedGroup === g ? { background: groupColor(g), borderColor: groupColor(g) } : {}}
              >
                {g.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-3">
            {seriesPoints.length > 0 && (
              <span className="font-mono text-[10px] text-white/35">
                {seriesPoints.length} obs · {seriesPoints[0]?.period} → {seriesPoints[seriesPoints.length - 1]?.period}
              </span>
            )}
            <CreditHwConstraintsPanel
              value={constraints}
              onChange={setConstraints}
              fittedParams={hwResult?.params ?? null}
            />
          </div>
        </div>
      </div>

      {/* ── Main Body ────────────────────────────────────────────── */}
      <div className="flex flex-1" style={{ minHeight: 600 }}>
        {/* Left sidebar */}
        <aside className="w-[210px] shrink-0 overflow-y-auto border-r border-white/[0.06] bg-black/40 py-2">
          {sectorsInGroup.map((sector) => {
            const active = sector.id === selectedId
            const dotColor = groupColor(sector.group)
            return (
              <button
                key={sector.id}
                type="button"
                onClick={() => setSelectedId(sector.id)}
                className={`w-full px-3 py-2.5 text-left transition-colors ${
                  active ? "bg-white/[0.07] text-white" : "text-white/50 hover:bg-white/[0.03] hover:text-white/80"
                }`}
              >
                <div className="flex items-start gap-2">
                  <span
                    className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: active ? dotColor : "rgba(148,163,184,0.3)" }}
                  />
                  <span className="text-[11px] leading-snug font-medium">{sector.label}</span>
                </div>
              </button>
            )
          })}
        </aside>

        {/* Right panel: metrics + chart */}
        <div className="flex flex-1 flex-col">
          {/* Metrics strip */}
          <div className="shrink-0 border-b border-white/[0.05] bg-black/30 px-5 py-3">
            <div className="mx-auto max-w-[1600px] flex flex-wrap items-center gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: groupColor(selectedSector?.group ?? "") }} />
                  <span className="font-semibold text-white text-[13px]">{selectedSector?.label}</span>
                  <span className="font-mono text-[10px] text-white/30">· ₹ Crores</span>
                </div>
                <div className="mt-0.5 font-mono text-[9px] text-white/30 tracking-widest uppercase">
                  {selectedSector?.group}
                </div>
              </div>

              {hwResult && !computing && (
                <div className="ml-auto flex flex-wrap gap-2">
                  {overallAccPct != null && (
                    <MetricPill label="Accuracy" value={`${overallAccPct.toFixed(1)}%`} good={overallAccPct >= 80} />
                  )}
                  {mape != null && <MetricPill label="MAPE" value={`${mape.toFixed(1)}%`} />}
                  {mae != null && (
                    <MetricPill label="MAE" value={mae >= 1000 ? `${(mae / 1000).toFixed(0)}k` : mae.toFixed(0)} />
                  )}
                  {rmse != null && (
                    <MetricPill label="RMSE" value={rmse >= 1000 ? `${(rmse / 1000).toFixed(0)}k` : rmse.toFixed(0)} />
                  )}
                  <div className="flex flex-col items-center rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 min-w-[90px]">
                    <span className="font-mono text-[10px] font-bold tracking-[0.2em] text-white/40 uppercase">Model</span>
                    <span className="mt-0.5 font-mono text-[11px] font-semibold text-white/70">
                      {hwResult.params.trendKind.toUpperCase()}-{hwResult.params.seasonalKind.toUpperCase()} m={hwResult.params.m}
                    </span>
                  </div>
                </div>
              )}
              {computing && (
                <div className="ml-auto flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-500" />
                  <span className="font-mono text-[10px] text-white/35">Computing…</span>
                </div>
              )}
              {hwError && !computing && (
                <div className="ml-auto rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2">
                  <span className="font-mono text-[10px] text-amber-400/80">{hwError}</span>
                </div>
              )}
            </div>
          </div>

          {/* Chart */}
          <div className="shrink-0 p-5" style={{ height: 500 }}>
            <AnimatePresence mode="wait">
              {hwResult && !computing && !hwError ? (
                <motion.div
                  key={`${selectedId}-${constraints.coefMode}-${constraints.m}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  style={{ height: "100%" }}
                >
                  <CreditForecastChart
                    sectorLabel={selectedSector?.label ?? selectedId}
                    hwResult={hwResult}
                  />
                </motion.div>
              ) : !hwResult && !computing && !hwError ? (
                <div className="flex h-full items-center justify-center">
                  <span className="font-mono text-[11px] text-white/25">Select a sector to begin</span>
                </div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
