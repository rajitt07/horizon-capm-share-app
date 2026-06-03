import React, { useMemo } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  useXAxisScale,
  useYAxisScale
} from "recharts";
import type { ScatterShapeProps } from "recharts";
import type { IBucketData, IJoinedFund, ITimeframeYears } from "../data/types";

const HORIZONS: ITimeframeYears[] = ["1", "3", "5", "10"];

/** One stable color per fund (legend + markers); sign is encoded with opacity + stroke, not hue swap. */
const SERIES_COLORS = [
  "#4ade80",
  "#38bdf8",
  "#f472b6",
  "#fbbf24",
  "#a78bfa",
  "#fb923c",
  "#2dd4bf",
  "#22d3ee",
  "#86efac",
  "#818cf8",
  "#fcd34d",
  "#e879f9",
  "#5eead4",
  "#34d399",
  "#60a5fa"
];

const MAX_FUNDS_ON_CHART = 15;

const NEGATIVE_FILL_OPACITY = 0.48;
const NEGATIVE_STROKE = "rgba(248, 113, 113, 0.95)";
const NEGATIVE_STROKE_WIDTH = 2;

/** Skip vertical stem / zero ring when α is effectively zero (avoid double dot). */
const ALPHA_ZERO_EPS = 1e-4;

type SeriesDef = { dataKey: string; fund: IJoinedFund; color: string; legendLabel: string };

type ScatterRow = {
  x: number;
  y: number;
  horizon: string;
  neg: boolean;
  fillColor: string;
};

function truncateLabel(name: string, max = 28): string {
  const t = name.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function alphaRangeFromRows(rows: ScatterRow[]): { yMin: number; yMax: number } {
  let yMin = 0;
  let yMax = 0;
  for (const r of rows) {
    if (Number.isFinite(r.y)) {
      yMin = Math.min(yMin, r.y);
      yMax = Math.max(yMax, r.y);
    }
  }
  return { yMin, yMax };
}

function computeYAxisDomain(yMin: number, yMax: number): [number, number] {
  const lo = Math.min(0, yMin);
  const hi = Math.max(0, yMax);
  let span = hi - lo;
  if (!Number.isFinite(span) || span < 1e-9) {
    span = Math.max(Math.abs(yMin), Math.abs(yMax), 1) * 0.25;
    if (span < 1e-9) span = 1;
  }
  const pad = span * 0.1;
  let d0 = lo - pad;
  let d1 = hi + pad;
  d0 = Math.floor(d0 * 10) / 10;
  d1 = Math.ceil(d1 * 10) / 10;
  if (d0 > lo) d0 = Math.floor(lo * 10) / 10;
  if (d1 < hi) d1 = Math.ceil(hi * 10) / 10;
  if (d0 === d1) {
    d0 -= 0.5;
    d1 += 0.5;
  }
  return [d0, d1];
}

function formatYAxisTick(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  const r = Math.round(n * 100) / 100;
  if (Math.abs(r) < 1e-6) return "0%";
  if (Number.isInteger(r)) return `${r}%`;
  const t = r.toFixed(1);
  return t.endsWith(".0") ? `${Math.round(r)}%` : `${t}%`;
}

function buildXLayout(fundCount: number) {
  const n = Math.max(1, fundCount);
  const fundStep = Math.min(0.95, Math.max(0.52, 2.35 / n));
  const groupGap = Math.max(0.5, 1.05 - 0.035 * n);
  const clusterSpan = n * fundStep;
  const stride = clusterSpan + groupGap;
  const xFor = (h: number, i: number) => h * stride + i * fundStep;
  const tick = (h: number) => h * stride + ((n - 1) * fundStep) / 2;
  const xMax = 3 * stride + (n - 1) * fundStep;
  const pad = 0.22;
  return { fundStep, groupGap, stride, xFor, tick, xMin: -pad, xMax: xMax + pad };
}

function FundAlphaDot(props: ScatterShapeProps) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const neg = Boolean(payload?.neg);
  const fill = typeof payload?.fillColor === "string" ? payload.fillColor : String(props.fill ?? "#94a3b8");
  const r = neg ? 4.5 : 4;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={fill}
      fillOpacity={neg ? NEGATIVE_FILL_OPACITY : 1}
      stroke={neg ? NEGATIVE_STROKE : fill}
      strokeWidth={neg ? NEGATIVE_STROKE_WIDTH : 0}
    />
  );
}

function AlphaStemLayer(props: { stems: { x: number; y: number }[] }) {
  const { stems } = props;
  const xScale = useXAxisScale(0);
  const yScale = useYAxisScale(0);
  if (!xScale || !yScale) return null;
  return (
    <g className="recharts-layer alpha-stem-layer" style={{ pointerEvents: "none" }}>
      {stems.map((p, i) => {
        const cx = xScale(p.x);
        const y0 = yScale(0);
        const y1 = yScale(p.y);
        if (cx === undefined || y0 === undefined || y1 === undefined) return null;
        return (
          <g key={`${p.x}-${p.y}-${i}`}>
            <line
              x1={cx}
              y1={y0}
              x2={cx}
              y2={y1}
              stroke="rgba(148, 163, 184, 0.38)"
              strokeWidth={1.25}
              strokeDasharray="4 4"
            />
            <circle cx={cx} cy={y0} r={3.25} fill="transparent" stroke="rgba(226, 232, 240, 0.55)" strokeWidth={1.5} />
          </g>
        );
      })}
    </g>
  );
}

/**
 * Scatter-style α by horizon: numeric x clusters per 1Y/3Y/5Y/10Y, one column per fund.
 * Hollow ring at 0%, dashed stem to α, filled dot at α (per-fund colors; negative α dimmed + rose outline).
 */
export function AlphaHorizonChart(props: {
  bucket: IBucketData;
  selectedSchemeKeys: string[];
  datasetLabel?: string;
}) {
  const { bucket, selectedSchemeKeys, datasetLabel } = props;

  const { chartData, seriesByFund, truncated, hasAnyAlpha, yMin, yMax, yDomain, xLayout, tickEntries, stems } =
    useMemo(() => {
      if (!selectedSchemeKeys.length) {
        return {
          chartData: [] as ScatterRow[],
          seriesByFund: [] as { series: SeriesDef; rows: ScatterRow[] }[],
          truncated: false,
          hasAnyAlpha: false,
          yMin: 0,
          yMax: 0,
          yDomain: [0, 1] as [number, number],
          xLayout: buildXLayout(1),
          tickEntries: [] as { pos: number; label: string }[],
          stems: [] as { x: number; y: number }[]
        };
      }

      const keys = selectedSchemeKeys.filter((k) => bucket.fundsByKey.has(k));
      const take = keys.slice(0, MAX_FUNDS_ON_CHART);
      const truncated = keys.length > take.length;

      const funds: IJoinedFund[] = [];
      for (const k of take) {
        const f = bucket.fundsByKey.get(k);
        if (f) funds.push(f);
      }

      if (!funds.length) {
        return {
          chartData: [],
          seriesByFund: [],
          truncated,
          hasAnyAlpha: false,
          yMin: 0,
          yMax: 0,
          yDomain: [0, 1] as [number, number],
          xLayout: buildXLayout(1),
          tickEntries: [],
          stems: []
        };
      }

      const series: SeriesDef[] = funds.map((fund, i) => ({
        dataKey: `f${i}`,
        fund,
        color: SERIES_COLORS[i % SERIES_COLORS.length],
        legendLabel: truncateLabel(fund.schemeName)
      }));

      const xl = buildXLayout(series.length);
      const tickEntries = HORIZONS.map((h, hi) => ({ pos: xl.tick(hi), label: `${h}Y` }));

      const seriesByFund: { series: SeriesDef; rows: ScatterRow[] }[] = [];
      const chartData: ScatterRow[] = [];
      const stems: { x: number; y: number }[] = [];

      for (let i = 0; i < series.length; i++) {
        const s = series[i];
        const rows: ScatterRow[] = [];
        for (let hi = 0; hi < HORIZONS.length; hi++) {
          const h = HORIZONS[hi];
          const a = s.fund.alphaByHorizon[h];
          if (a === null || a === undefined || !Number.isFinite(a)) continue;
          const x = xl.xFor(hi, i);
          const neg = a < 0;
          const row: ScatterRow = { x, y: a, horizon: `${h}Y`, neg, fillColor: s.color };
          rows.push(row);
          chartData.push(row);
          if (Math.abs(a) > ALPHA_ZERO_EPS) stems.push({ x, y: a });
        }
        seriesByFund.push({ series: s, rows });
      }

      let hasAnyAlpha = chartData.length > 0;
      const { yMin, yMax } = alphaRangeFromRows(chartData);
      const yDomain = computeYAxisDomain(yMin, yMax);

      return {
        chartData,
        seriesByFund,
        truncated,
        hasAnyAlpha,
        yMin,
        yMax,
        yDomain,
        xLayout: xl,
        tickEntries,
        stems
      };
    }, [bucket, selectedSchemeKeys]);

  const bucketHint = datasetLabel ? `${datasetLabel} data` : "this bucket";

  if (!selectedSchemeKeys.length) {
    return (
      <div className="w-full font-mono">
        {datasetLabel ? (
          <div className="mb-2 font-terminal text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
            {datasetLabel}
          </div>
        ) : null}
        <div className="flex h-[200px] items-center justify-center px-4 text-center text-sm text-neutral-500">
          Select one or more funds to compare alpha at 1Y, 3Y, 5Y, and 10Y ({bucketHint}).
        </div>
      </div>
    );
  }

  if (!seriesByFund.length) {
    return (
      <div className="w-full font-mono">
        {datasetLabel ? (
          <div className="mb-2 font-terminal text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
            {datasetLabel}
          </div>
        ) : null}
        <div className="flex h-[200px] items-center justify-center text-sm text-neutral-500">
          Selected funds are not in {datasetLabel ? `the ${datasetLabel} dataset` : "this bucket"}.
        </div>
      </div>
    );
  }

  if (!hasAnyAlpha) {
    return (
      <div className="w-full font-mono">
        {datasetLabel ? (
          <div className="mb-2 font-terminal text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
            {datasetLabel}
          </div>
        ) : null}
        <div className="flex h-[200px] items-center justify-center text-sm text-neutral-500">
          No alpha data for the current selection{datasetLabel ? ` (${datasetLabel})` : ""}.
        </div>
      </div>
    );
  }

  const [domainMin, domainMax] = yDomain;
  const tickPositions = tickEntries.map((t) => t.pos);
  const tickFormatter = (v: number) => {
    const hit = tickEntries.find((t) => Math.abs(t.pos - v) < 1e-6);
    return hit ? hit.label : "";
  };

  return (
    <div className="w-full font-mono">
      {datasetLabel ? (
        <div className="mb-2 font-terminal text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
          {datasetLabel}
        </div>
      ) : null}
      {truncated ? (
        <p className="mb-2 text-[10px] text-neutral-500">
          Showing first {MAX_FUNDS_ON_CHART} selected funds. Narrow selection for a clearer chart.
        </p>
      ) : null}
      <p className="mb-2 text-[10px] text-neutral-500 leading-snug">
        Each fund keeps its legend color. Hollow ring at 0% (benchmark α), dashed stem to the filled dot (realized α). α &lt; 0:
        same hue, dimmer fill + rose outline. Green / red tint shows above / below 0%.
      </p>
      <div className="h-[280px] w-full">
        <ResponsiveContainer>
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid stroke="rgba(148, 163, 184, 0.1)" vertical={false} />
            {yMax > 0 ? (
              <ReferenceArea
                y1={0}
                y2={domainMax}
                fill="#22c55e"
                fillOpacity={0.14}
                strokeOpacity={0}
                ifOverflow="extendDomain"
              />
            ) : null}
            {yMin < 0 ? (
              <ReferenceArea
                y1={domainMin}
                y2={0}
                fill="#f43f5e"
                fillOpacity={0.16}
                strokeOpacity={0}
                ifOverflow="extendDomain"
              />
            ) : null}
            <XAxis
              type="number"
              dataKey="x"
              domain={[xLayout.xMin, xLayout.xMax]}
              ticks={tickPositions}
              tickFormatter={tickFormatter}
              tick={{ fill: "#64748b", fontSize: 10 }}
              allowDataOverflow
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 10 }}
              domain={yDomain}
              tickFormatter={formatYAxisTick}
              allowDecimals
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const horizon =
                  typeof payload[0]?.payload?.horizon === "string" ? String(payload[0].payload.horizon) : String(label);
                const rows = payload
                  .filter((p) => {
                    // Accept numeric values regardless of dataKey label —
                    // Recharts Scatter exposes dataKey inconsistently across versions.
                    const v = p.value !== null && p.value !== undefined ? Number(p.value) : NaN;
                    return Number.isFinite(v);
                  })
                  .sort((a, b) => Number(b.value) - Number(a.value))
                  // Deduplicate by name in case Recharts emits duplicate payload entries.
                  .filter((p, i, arr) => arr.findIndex((q) => q.name === p.name) === i);
                if (!rows.length) return null;
                return (
                  <div className="max-w-xs rounded-lg border border-white/[0.08] bg-black px-3 py-2 text-xs shadow-xl">
                    <div className="mb-1 font-semibold text-neutral-300">{horizon}</div>
                    <ul className="space-y-0.5">
                      {rows.map((p) => {
                        const n = Number(p.value);
                        const fromPayload = typeof p.color === "string" && p.color.length > 0 ? p.color : null;
                        const fromSeries = seriesByFund.find((b) => b.series.legendLabel === p.name)?.series.color;
                        const rowColor = fromPayload ?? fromSeries ?? "#94a3b8";
                        return (
                          <li
                            key={String(p.name) + String(p.value)}
                            className="flex justify-between gap-4 tabular-nums"
                            style={{ color: rowColor }}
                          >
                            <span className="truncate min-w-0" title={String(p.name)}>
                              {p.name}
                            </span>
                            <span className="shrink-0 font-medium">{n.toFixed(2)}%</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
              formatter={(value) => <span className="text-neutral-400">{value}</span>}
            />
            <ReferenceLine
              y={0}
              stroke="rgba(226, 232, 240, 0.55)"
              strokeWidth={2}
              strokeDasharray="4 3"
            />
            <AlphaStemLayer stems={stems} />
            {seriesByFund.map(({ series: s, rows }) => (
              <Scatter
                key={s.dataKey}
                name={s.legendLabel}
                data={rows}
                dataKey="y"
                fill={s.color}
                shape={FundAlphaDot}
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
