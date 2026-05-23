import { useMemo, useCallback } from "react"
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts"
import type { HwForecastResult } from "../lib/holtwinters"
import { useRechartsStrokeDraw } from "../lib/useRechartsStrokeDraw"
const COLOR_HISTORY = "#A0B4CC"
const FONT_MONO = '"JetBrains Mono", ui-monospace, monospace'

type Props = {
  sectorLabel: string
  hwResult: HwForecastResult
}

type ChartPoint = {
  label: string
  historical: number | null
  forecast: number | null
  upper: number | null
  lower: number | null
}

function formatK(v: number): string {
  if (v === 0) return "0"
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `${(v / 1_000).toFixed(0)}k`
  if (abs < 10)         return v.toFixed(2)
  return `${Math.round(v)}`
}

function buildPoints(hw: HwForecastResult): {
  points: ChartPoint[]
  forecastStartLabel: string | null
} {
  const histPeriods = hw.history.periods
  const histValues  = hw.history.values
  const fcPeriods   = hw.forecast.periods
  const fcValues    = hw.forecast.values
  const upper       = hw.forecast.upper_95 ?? []
  const lower       = hw.forecast.lower_95 ?? []

  const points: ChartPoint[] = histPeriods.map((label, i) => ({
    label,
    historical: histValues[i] ?? null,
    forecast: null,
    upper: null,
    lower: null,
  }))

  let forecastStartLabel: string | null = null
  if (points.length && fcPeriods.length) {
    const last = points[points.length - 1]
    last.forecast = last.historical
    forecastStartLabel = last.label
  }

  fcPeriods.forEach((label, i) => {
    points.push({
      label,
      historical: null,
      forecast: fcValues[i] ?? null,
      upper: upper[i] ?? null,
      lower: lower[i] ?? null,
    })
  })

  return { points, forecastStartLabel }
}

type TooltipEntry = { dataKey?: string; value?: number | null }
type CustomTooltipProps = { active?: boolean; payload?: TooltipEntry[]; label?: string }

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null

  const rows = (["historical", "forecast"] as const)
    .map((key) => ({ key, entry: payload.find((p) => p.dataKey === key) }))
    .filter(({ entry }) => entry?.value != null) as Array<{
    key: "historical" | "forecast"
    entry: TooltipEntry
  }>

  if (!rows.length) return null

  const META = {
    historical: { name: "HISTORICAL", color: COLOR_HISTORY, glow: false },
    forecast:   { name: "FORECAST",   color: "#39FF14",    glow: true  },
  }

  return (
    <div
      style={{
        background: "rgba(8,12,22,0.94)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        padding: "10px 12px",
        backdropFilter: "blur(8px)",
        boxShadow: "0 18px 40px -20px rgba(0,0,0,0.8)",
        minWidth: 190,
      }}
    >
      <div style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: "0.16em", color: "#94A3B8", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {rows.map(({ key, entry }) => {
          const meta = META[key]
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 8, height: 8, borderRadius: 999,
                  background: meta.color,
                  boxShadow: meta.glow ? `0 0 10px ${meta.color}` : "none",
                }}
              />
              <span style={{ fontFamily: FONT_MONO, color: "#E7ECF3", fontSize: 14, lineHeight: 1.1 }}>
                {Number(entry.value).toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr
              </span>
              <span style={{ fontSize: 9, color: "#6B7A90", letterSpacing: "0.14em", marginLeft: "auto" }}>
                {meta.name}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function CreditForecastChart({ sectorLabel, series, hwResult }: Props) {
  const { points, forecastStartLabel } = useMemo(
    () => buildPoints(hwResult),
    [hwResult],
  )

  const drawRevision = useMemo(
    () => `${sectorLabel}:${points.length}:${forecastStartLabel ?? ""}`,
    [sectorLabel, points.length, forecastStartLabel],
  )

  const delayForIndex = useCallback((i: number) => (i <= 0 ? 0 : 800), [])

  const chartWrapRef = useRechartsStrokeDraw({
    revision: drawRevision,
    duration: 1400,
    easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
    delayForIndex,
  })

  const xTicks = useMemo(() => {
    const n = points.length
    if (!n) return [] as string[]
    const step = Math.max(1, Math.round(n / 10))
    return points.filter((_, i) => i % step === 0 || points[i].label === forecastStartLabel).map((p) => p.label)
  }, [points, forecastStartLabel])

  return (
    <div ref={chartWrapRef} style={{ width: "100%", height: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 12, right: 28, left: 8, bottom: 28 }}>
          <defs>
            <linearGradient id="cfGradFcStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#7C6FFF" />
              <stop offset="100%" stopColor="#39FF14" />
            </linearGradient>
            <linearGradient id="cfGradFcArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#39FF14" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#39FF14" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="cfGradBand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#39FF14" stopOpacity={0.07} />
              <stop offset="100%" stopColor="#39FF14" stopOpacity={0.01} />
            </linearGradient>
            <filter id="cfFcGlow" x="-40%" y="-40%" width="180%" height="180%" filterUnits="userSpaceOnUse">
              <feDropShadow dx="0" dy="0" stdDeviation="3"  floodColor="#39FF14" floodOpacity="0.65" />
              <feDropShadow dx="0" dy="0" stdDeviation="8"  floodColor="#39FF14" floodOpacity="0.45" />
              <feDropShadow dx="0" dy="0" stdDeviation="16" floodColor="#7C6FFF" floodOpacity="0.25" />
            </filter>
          </defs>

          <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="2 4" vertical={false} />

          <XAxis
            dataKey="label"
            ticks={xTicks}
            interval={0}
            tick={{ fill: "#6B7A90", fontFamily: FONT_MONO, fontSize: 9, letterSpacing: 0.5 }}
            axisLine={false}
            tickLine={false}
            angle={-32}
            textAnchor="end"
            height={52}
            dy={6}
          />
          <YAxis
            tickFormatter={formatK}
            tick={{ fill: "#6B7A90", fontFamily: FONT_MONO, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={60}
            domain={["auto", "auto"]}
          />

          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.08)", strokeDasharray: "3 4" }}
            content={<CustomTooltip />}
            isAnimationActive={false}
          />

          {forecastStartLabel && (
            <ReferenceLine
              x={forecastStartLabel}
              stroke="#444"
              strokeDasharray="6 4"
              ifOverflow="extendDomain"
              label={{
                value: "FORECAST",
                position: "insideTopRight",
                fill: "#6B7A90",
                fontFamily: FONT_MONO,
                fontSize: 9,
                letterSpacing: 2,
                dy: 4,
                dx: -6,
              }}
            />
          )}

          {/* 95% confidence band */}
          <Area
            type="monotone"
            dataKey="upper"
            stroke="none"
            fill="url(#cfGradBand)"
            isAnimationActive
            animationDuration={1200}
            animationBegin={700}
            animationEasing="ease-out"
            connectNulls={false}
            activeDot={false}
          />

          {/* Forecast area fill */}
          <Area
            type="monotone"
            dataKey="forecast"
            stroke="none"
            fill="url(#cfGradFcArea)"
            isAnimationActive
            animationDuration={1200}
            animationBegin={700}
            animationEasing="ease-out"
            connectNulls={false}
            activeDot={false}
          />

          {/* Historical */}
          <Line
            type="monotone"
            dataKey="historical"
            stroke={COLOR_HISTORY}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: COLOR_HISTORY, stroke: "#080C14", strokeWidth: 2 }}
            isAnimationActive={false}
            connectNulls={false}
            name="Historical"
          />

          {/* Forecast */}
          <Line
            type="monotone"
            dataKey="forecast"
            stroke="url(#cfGradFcStroke)"
            strokeWidth={2.75}
            dot={false}
            activeDot={{ r: 5, fill: "#39FF14", stroke: "#080C14", strokeWidth: 2 }}
            isAnimationActive={false}
            connectNulls={false}
            filter="url(#cfFcGlow)"
            name="Forecast"
          />

          {/* 95% lower band line (subtle) */}
          <Line
            type="monotone"
            dataKey="lower"
            stroke="rgba(57,255,20,0.18)"
            strokeWidth={1}
            strokeDasharray="3 4"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
            connectNulls={false}
            name="Lower 95%"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
