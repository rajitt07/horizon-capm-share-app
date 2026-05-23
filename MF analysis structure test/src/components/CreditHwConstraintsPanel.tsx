import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  DEFAULT_HW_CONSTRAINTS,
  type HwCoefMode,
  type HwConstraints,
  type HwForecastResult,
  type HwSeasonalKind,
  type HwTrendKind,
} from "../lib/holtwinters"

type Props = {
  value: HwConstraints
  onChange: (next: HwConstraints) => void
  fittedParams?: HwForecastResult["params"] | null
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  step = 0.05,
  min,
  max,
  placeholder,
  disabled,
}: {
  label: string
  hint?: string
  value: number | null
  onChange: (v: number | null) => void
  step?: number
  min?: number
  max?: number
  placeholder?: string
  disabled?: boolean
}) {
  const [text, setText] = useState<string>(value == null ? "" : String(value))
  useEffect(() => { setText(value == null ? "" : String(value)) }, [value])

  return (
    <label className={`flex flex-col gap-1 ${disabled ? "opacity-50" : ""}`}>
      <span className="flex items-center justify-between gap-2 text-[10px] font-semibold tracking-[0.18em] text-white/70">
        <span>{label}</span>
        {hint && <span className="font-mono text-[9px] tracking-normal text-white/40">{hint}</span>}
      </span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          const t = e.target.value
          setText(t)
          if (t.trim() === "") { onChange(null); return }
          const n = Number(t)
          if (Number.isFinite(n)) onChange(n)
        }}
        className="w-full rounded-md border border-white/[0.12] bg-white/[0.04] px-2.5 py-1.5 font-mono text-[12px] text-white outline-none transition-colors focus:border-emerald-500/60 focus:bg-emerald-500/5 disabled:cursor-not-allowed"
      />
    </label>
  )
}

function SegControl<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string
  hint?: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center justify-between gap-2 text-[10px] font-semibold tracking-[0.18em] text-white/70">
        <span>{label}</span>
        {hint && <span className="font-mono text-[9px] tracking-normal text-white/40">{hint}</span>}
      </span>
      <div
        className="grid gap-1 rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((o) => {
          const active = value === o.value
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`rounded-md px-1.5 py-1 text-[10px] font-bold tracking-[0.1em] transition-colors ${
                active
                  ? "bg-emerald-500 text-black"
                  : "text-white/75 hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const COEF_MODE_OPTIONS: { value: HwCoefMode; label: string; help: string }[] = [
  { value: "optimized", label: "OPT",      help: "Fine grid search over (α, β, γ) minimising MSE." },
  { value: "autostats", label: "AUTO",     help: "Pick (trend, seasonal) structure by MSE, then optimise." },
  { value: "grid",      label: "GRID",     help: "Coarse grid search over (α, β, γ)." },
  { value: "manual",    label: "MANUAL",   help: "Use the α, β, γ values below directly." },
]

const TREND_OPTIONS: { value: HwTrendKind; label: string }[] = [
  { value: "add", label: "ADD" },
  { value: "mul", label: "MUL" },
]

const SEASONAL_OPTIONS: { value: HwSeasonalKind; label: string }[] = [
  { value: "none", label: "NONE" },
  { value: "add",  label: "ADD"  },
  { value: "mul",  label: "MUL"  },
]

function constraintsAreCustom(value: HwConstraints): boolean {
  return (
    value.coefMode !== DEFAULT_HW_CONSTRAINTS.coefMode ||
    value.trendKind !== DEFAULT_HW_CONSTRAINTS.trendKind ||
    value.seasonalKind !== DEFAULT_HW_CONSTRAINTS.seasonalKind ||
    value.m != null ||
    value.holdout != null ||
    value.forecastSteps != null
  )
}

export default function CreditHwConstraintsPanel({ value, onChange, fittedParams }: Props) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDocClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDocClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const isManual = value.coefMode === "manual"
  const seasonalDisabled = value.seasonalKind === "none"
  const isCustom = constraintsAreCustom(value)
  const activeModeHelp = COEF_MODE_OPTIONS.find((o) => o.value === value.coefMode)?.help

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Holt-Winters constraints"
        aria-expanded={open}
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold tracking-[0.16em] backdrop-blur transition-colors duration-200 ${
          isCustom || open
            ? "border-emerald-500/70 bg-emerald-500/10 text-emerald-400"
            : "border-white/[0.12] bg-black/60 text-white/80 hover:border-white/25 hover:text-white"
        }`}
      >
        {/* sliders icon */}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
          <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
          <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/>
          <line x1="17" y1="16" x2="23" y2="16"/>
        </svg>
        CONSTRAINTS
        {isCustom && (
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 8px rgba(52,211,153,0.9)" }} />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
            className="absolute right-0 top-[calc(100%+10px)] z-30 w-[360px] origin-top-right rounded-xl border border-white/[0.1] bg-[rgba(10,14,22,0.97)] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.7)] backdrop-blur-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="font-mono text-[9px] font-bold tracking-[0.24em] text-emerald-400">HOLT-WINTERS</span>
                <h3 className="text-[13px] font-semibold text-white">Model constraints</h3>
                <p className="mt-0.5 text-[10px] leading-snug text-white/40">
                  Control mode, structure, α/β/γ, seasonal period, holdout & forecast horizon.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded p-1 text-white/40 transition-colors hover:bg-white/5 hover:text-white"
              >
                {/* X icon */}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-3">
              {/* Coefficient mode */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold tracking-[0.18em] text-white/70">COEFFICIENT MODE</span>
                <div className="grid grid-cols-4 gap-1 rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5">
                  {COEF_MODE_OPTIONS.map((opt) => {
                    const active = value.coefMode === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => onChange({ ...value, coefMode: opt.value })}
                        className={`rounded-md px-1 py-1.5 text-[9.5px] font-bold tracking-[0.08em] transition-colors ${
                          active ? "bg-emerald-500 text-black" : "text-white/75 hover:bg-white/[0.04] hover:text-white"
                        }`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
                {activeModeHelp && <p className="text-[9.5px] leading-snug text-white/40">{activeModeHelp}</p>}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <SegControl<HwTrendKind>
                  label="TREND" hint="kind" value={value.trendKind}
                  options={TREND_OPTIONS}
                  onChange={(v) => onChange({ ...value, trendKind: v })}
                />
                <SegControl<HwSeasonalKind>
                  label="SEASONAL" hint="kind" value={value.seasonalKind}
                  options={SEASONAL_OPTIONS}
                  onChange={(v) => onChange({ ...value, seasonalKind: v })}
                />
              </div>

              <div className={`grid grid-cols-3 gap-2 ${isManual ? "" : "pointer-events-none opacity-50"}`}>
                <NumberField label="α" hint="level" value={value.alpha} step={0.05} min={0} max={1}
                  onChange={(v) => onChange({ ...value, alpha: v ?? 0 })} />
                <NumberField label="β" hint="trend" value={value.beta} step={0.05} min={0} max={1}
                  onChange={(v) => onChange({ ...value, beta: v ?? 0 })} />
                <NumberField label="γ" hint="seasonal" value={value.gamma} step={0.05} min={0} max={1}
                  disabled={seasonalDisabled}
                  onChange={(v) => onChange({ ...value, gamma: v ?? 0 })} />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <NumberField label="m" hint="period" value={value.m} step={1} min={2} placeholder="auto"
                  disabled={seasonalDisabled}
                  onChange={(v) => onChange({ ...value, m: v && v >= 2 ? Math.floor(v) : null })} />
                <NumberField label="Holdout" hint="test" value={value.holdout} step={1} min={0} placeholder="auto"
                  onChange={(v) => onChange({ ...value, holdout: v != null && v >= 0 ? Math.floor(v) : null })} />
                <NumberField label="Horizon" hint="forecast" value={value.forecastSteps} step={1} min={1} placeholder="auto"
                  onChange={(v) => onChange({ ...value, forecastSteps: v && v > 0 ? Math.floor(v) : null })} />
              </div>

              {fittedParams && (
                <div className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 py-2">
                  <div className="flex items-center justify-between text-[9px] font-bold tracking-[0.22em] text-white/60">
                    <span>FITTED</span>
                    <span className="font-mono text-[9px] tracking-normal text-white/35">
                      {fittedParams.trendKind}-trend · {fittedParams.seasonalKind}-seasonal · m={fittedParams.m} · holdout={fittedParams.holdout}
                    </span>
                  </div>
                  <div className="mt-1 grid grid-cols-3 gap-2 font-mono text-[11px] text-white">
                    <span>α={fittedParams.alpha.toFixed(3)}</span>
                    <span>β={fittedParams.beta.toFixed(3)}</span>
                    <span>γ={fittedParams.gamma.toFixed(3)}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-white/[0.07] pt-3">
                <button
                  type="button"
                  onClick={() => onChange({ ...DEFAULT_HW_CONSTRAINTS })}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold tracking-[0.16em] text-white/60 transition-colors hover:bg-white/[0.05] hover:text-white"
                >
                  {/* RotateCcw icon */}
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.44"/>
                  </svg>
                  RESET
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-emerald-500 bg-emerald-500 px-3 py-1 text-[10px] font-bold tracking-[0.16em] text-black transition-transform hover:scale-[1.02]"
                >
                  DONE
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
