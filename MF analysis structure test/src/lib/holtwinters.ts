// ─────────────────────────────────────────────────────────────
// Holt-Winters exponential smoothing (additive / multiplicative).
//
// Mirrors the constraint surface of the historical Cycle Filters
// backend (afed267, 1c9ad11):
//   - coef mode: optimized | autostats | grid | manual
//   - trend kind: add | mul
//   - seasonal kind: none | add | mul
//   - seasonal period m, holdout, forecast steps
//   - manual smoothing coefficients α, β, γ
//
// Pure TS — no external dependencies.
// ─────────────────────────────────────────────────────────────

export type AccuracyMetrics = {
  mae?: number | null
  rmse?: number | null
  mape_pct?: number | null
  overall_accuracy_pct?: number | null
}

export type HwCoefMode = 'optimized' | 'autostats' | 'grid' | 'manual'
export type HwTrendKind = 'add' | 'mul'
export type HwSeasonalKind = 'none' | 'add' | 'mul'

export type HwConstraints = {
  coefMode: HwCoefMode
  trendKind: HwTrendKind
  seasonalKind: HwSeasonalKind
  alpha: number
  beta: number
  gamma: number
  m: number | null
  holdout: number | null
  forecastSteps: number | null
}

export const DEFAULT_HW_CONSTRAINTS: HwConstraints = {
  coefMode: 'optimized',
  trendKind: 'add',
  seasonalKind: 'add',
  alpha: 0.6,
  beta: 0.3,
  gamma: 0.38,
  m: null,
  holdout: null,
  forecastSteps: null,
}

const _CLAMP_LO = 1e-9
const _OPTIMIZED_ALPHAS = [0.05, 0.15, 0.25, 0.35, 0.5, 0.65, 0.8, 0.9, 0.95]
const _OPTIMIZED_BETAS = [0.0, 0.05, 0.1, 0.2, 0.3, 0.45]
const _OPTIMIZED_GAMMAS = [0.0, 0.05, 0.15, 0.3, 0.45, 0.6]
const _GRID_ALPHAS = [0.15, 0.35, 0.55, 0.75, 0.9]
const _GRID_BETAS = [0.0, 0.15, 0.3, 0.45]
const _GRID_GAMMAS = [0.0, 0.2, 0.4, 0.55]

function _clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

function _allPositive(values: number[]): boolean {
  for (const v of values) {
    if (!(v > _CLAMP_LO)) return false
  }
  return true
}

type HwRunResult = {
  fitted: Array<number | null>
  L: number
  B: number
  S: number[]
  m: number
  trendKind: HwTrendKind
  seasonalKind: HwSeasonalKind
  getForecast: (steps: number) => number[]
}

function _hwRun(
  values: number[],
  mIn: number,
  alpha: number,
  beta: number,
  gamma: number,
  trendKind: HwTrendKind,
  seasonalKind: HwSeasonalKind,
): HwRunResult | null {
  const n = values.length
  if (n < 2) return null

  // Downgrade kinds when data is incompatible with multiplicative math.
  const positive = _allPositive(values)
  const seasonal: HwSeasonalKind =
    seasonalKind === 'none' || (seasonalKind === 'mul' && !positive)
      ? seasonalKind === 'none'
        ? 'none'
        : 'add'
      : seasonalKind
  const trend: HwTrendKind = trendKind === 'mul' && !positive ? 'add' : trendKind
  const m = seasonal === 'none' ? 1 : Math.max(2, Math.floor(mIn))

  if (seasonal !== 'none' && n < 2 * m) return null

  let L: number
  let B: number
  let S: number[]

  if (seasonal === 'none') {
    L = values[0]
    if (trend === 'mul') {
      const v1 = values[1] > _CLAMP_LO ? values[1] : L
      B = v1 / Math.max(L, _CLAMP_LO)
    } else {
      B = values[1] - L
    }
    S = [0]
  } else {
    let sum1 = 0
    let sum2 = 0
    for (let i = 0; i < m; i++) {
      sum1 += values[i]
      sum2 += values[m + i]
    }
    L = sum1 / m
    const L2 = sum2 / m
    if (trend === 'mul') {
      const denom = L > _CLAMP_LO ? L : _CLAMP_LO
      const ratio = L2 / denom
      B = ratio > _CLAMP_LO ? Math.pow(ratio, 1 / m) : 1
    } else {
      B = (L2 - L) / m
    }

    S = new Array(m)
    if (seasonal === 'mul') {
      let mean = 0
      const Lsafe = L > _CLAMP_LO ? L : _CLAMP_LO
      for (let i = 0; i < m; i++) {
        S[i] = values[i] / Lsafe
        mean += S[i]
      }
      mean /= m
      const adj = mean > _CLAMP_LO ? mean : 1
      for (let i = 0; i < m; i++) S[i] /= adj
    } else {
      let mean = 0
      for (let i = 0; i < m; i++) {
        S[i] = values[i] - L
        mean += S[i]
      }
      mean /= m
      for (let i = 0; i < m; i++) S[i] -= mean
    }
  }

  const fitted: Array<number | null> = new Array(n).fill(null)
  const startT = seasonal === 'none' ? 1 : m

  for (let t = startT; t < n; t++) {
    const y = values[t]
    const j = seasonal === 'none' ? 0 : t % m
    const s = S[j]
    const Lp = L
    const Bp = B

    // Compute one-step-ahead fitted value using previous (Lp, Bp, s).
    let fit: number
    if (seasonal === 'none') {
      fit = trend === 'mul' ? Lp * Bp : Lp + Bp
    } else if (trend === 'mul' && seasonal === 'mul') {
      fit = Lp * Bp * s
    } else if (trend === 'mul' && seasonal === 'add') {
      fit = Lp * Bp + s
    } else if (trend === 'add' && seasonal === 'mul') {
      fit = (Lp + Bp) * s
    } else {
      fit = Lp + Bp + s
    }
    fitted[t] = Number.isFinite(fit) ? fit : null

    // Update L, B, S.
    if (seasonal === 'none') {
      if (trend === 'mul') {
        const LB = Lp * Bp
        L = alpha * y + (1 - alpha) * LB
        const Lsafe = Lp > _CLAMP_LO ? Lp : _CLAMP_LO
        B = beta * (L / Lsafe) + (1 - beta) * Bp
      } else {
        L = alpha * y + (1 - alpha) * (Lp + Bp)
        B = beta * (L - Lp) + (1 - beta) * Bp
      }
    } else if (trend === 'mul' && seasonal === 'mul') {
      const sSafe = s > _CLAMP_LO ? s : _CLAMP_LO
      L = alpha * (y / sSafe) + (1 - alpha) * (Lp * Bp)
      const Lsafe = Lp > _CLAMP_LO ? Lp : _CLAMP_LO
      B = beta * (L / Lsafe) + (1 - beta) * Bp
      const LSafe2 = L > _CLAMP_LO ? L : _CLAMP_LO
      S[j] = gamma * (y / LSafe2) + (1 - gamma) * s
    } else if (trend === 'mul' && seasonal === 'add') {
      L = alpha * (y - s) + (1 - alpha) * (Lp * Bp)
      const Lsafe = Lp > _CLAMP_LO ? Lp : _CLAMP_LO
      B = beta * (L / Lsafe) + (1 - beta) * Bp
      S[j] = gamma * (y - L) + (1 - gamma) * s
    } else if (trend === 'add' && seasonal === 'mul') {
      const sSafe = s > _CLAMP_LO ? s : _CLAMP_LO
      L = alpha * (y / sSafe) + (1 - alpha) * (Lp + Bp)
      B = beta * (L - Lp) + (1 - beta) * Bp
      const LSafe2 = L > _CLAMP_LO ? L : _CLAMP_LO
      S[j] = gamma * (y / LSafe2) + (1 - gamma) * s
    } else {
      L = alpha * (y - s) + (1 - alpha) * (Lp + Bp)
      B = beta * (L - Lp) + (1 - beta) * Bp
      S[j] = gamma * (y - L) + (1 - gamma) * s
    }
  }

  return {
    fitted,
    L,
    B,
    S,
    m,
    trendKind: trend,
    seasonalKind: seasonal,
    getForecast(steps: number) {
      const fc: number[] = []
      for (let h = 1; h <= steps; h++) {
        const j = seasonal === 'none' ? 0 : (n + h - 1) % m
        const s = S[j]
        let f: number
        if (seasonal === 'none') {
          f = trend === 'mul' ? L * Math.pow(B, h) : L + h * B
        } else if (trend === 'mul' && seasonal === 'mul') {
          f = L * Math.pow(B, h) * s
        } else if (trend === 'mul' && seasonal === 'add') {
          f = L * Math.pow(B, h) + s
        } else if (trend === 'add' && seasonal === 'mul') {
          f = (L + h * B) * s
        } else {
          f = L + h * B + s
        }
        fc.push(f)
      }
      return fc
    },
  }
}

function _mse(values: number[], fitted: Array<number | null>, startT: number): number | null {
  let err = 0
  let cnt = 0
  for (let t = startT; t < values.length; t++) {
    const f = fitted[t]
    if (f != null && Number.isFinite(f)) {
      const d = values[t] - f
      err += d * d
      cnt++
    }
  }
  if (cnt === 0) return null
  return err / cnt
}

function _gridSearch(
  values: number[],
  m: number,
  trendKind: HwTrendKind,
  seasonalKind: HwSeasonalKind,
  alphas: number[],
  betas: number[],
  gammas: number[],
): { alpha: number; beta: number; gamma: number } | null {
  let bestMse = Infinity
  let best: { alpha: number; beta: number; gamma: number } | null = null
  const startT = seasonalKind === 'none' ? 1 : m
  const gammasEff = seasonalKind === 'none' ? [0] : gammas

  for (const a of alphas) {
    for (const b of betas) {
      for (const g of gammasEff) {
        const res = _hwRun(values, m, a, b, g, trendKind, seasonalKind)
        if (!res) continue
        const mse = _mse(values, res.fitted, startT)
        if (mse != null && mse < bestMse) {
          bestMse = mse
          best = { alpha: a, beta: b, gamma: g }
        }
      }
    }
  }
  return best
}

function _autostats(
  values: number[],
  m: number,
  trendIn: HwTrendKind,
  seasonalIn: HwSeasonalKind,
): {
  alpha: number
  beta: number
  gamma: number
  trendKind: HwTrendKind
  seasonalKind: HwSeasonalKind
} | null {
  const positive = _allPositive(values)
  const trendSpace: HwTrendKind[] = positive ? ['add', 'mul'] : ['add']
  const seasonalSpace: HwSeasonalKind[] =
    seasonalIn === 'none' ? ['none'] : positive ? ['add', 'mul', 'none'] : ['add', 'none']

  // Bias slightly towards the user's selected structure by trying it first.
  const orderedTrend = trendSpace.includes(trendIn) ? [trendIn, ...trendSpace.filter((t) => t !== trendIn)] : trendSpace
  const orderedSeasonal = seasonalSpace.includes(seasonalIn)
    ? [seasonalIn, ...seasonalSpace.filter((s) => s !== seasonalIn)]
    : seasonalSpace

  let bestMse = Infinity
  let best:
    | { alpha: number; beta: number; gamma: number; trendKind: HwTrendKind; seasonalKind: HwSeasonalKind }
    | null = null

  for (const t of orderedTrend) {
    for (const s of orderedSeasonal) {
      const startT = s === 'none' ? 1 : m
      const picked = _gridSearch(values, m, t, s, _OPTIMIZED_ALPHAS, _OPTIMIZED_BETAS, _OPTIMIZED_GAMMAS)
      if (!picked) continue
      const res = _hwRun(values, m, picked.alpha, picked.beta, picked.gamma, t, s)
      if (!res) continue
      const mse = _mse(values, res.fitted, startT)
      if (mse != null && mse < bestMse) {
        bestMse = mse
        best = { ...picked, trendKind: t, seasonalKind: s }
      }
    }
  }
  return best
}

function _metrics(actual: number[], pred: number[]): AccuracyMetrics {
  const n = actual.length
  if (!n) return { mae: null, rmse: null, mape_pct: null, overall_accuracy_pct: null }
  let mae = 0
  let mse = 0
  let mape = 0
  for (let i = 0; i < n; i++) {
    const e = Math.abs(actual[i] - pred[i])
    mae += e
    mse += e * e
    mape += Math.abs(actual[i]) > 1e-10 ? e / Math.abs(actual[i]) : 0
  }
  mae /= n
  mse /= n
  mape = (mape / n) * 100
  return {
    mae: +mae.toFixed(4),
    rmse: +Math.sqrt(mse).toFixed(4),
    mape_pct: +mape.toFixed(4),
    overall_accuracy_pct: +Math.max(0, Math.min(100, 100 - mape)).toFixed(1),
  }
}

function _nextPeriods(lastPeriod: string | undefined, steps: number): string[] {
  if (lastPeriod && /^\d{4}-\d{2}-\d{2}$/.test(lastPeriod)) {
    const d = new Date(lastPeriod + 'T00:00:00Z')
    return Array.from({ length: steps }, () => {
      d.setUTCMonth(d.getUTCMonth() + 1)
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
    })
  }
  const monthly = lastPeriod?.match(/^(\d{4})-(\d{2})$/)
  if (monthly) {
    let yr = +monthly[1]
    let mo = +monthly[2]
    return Array.from({ length: steps }, () => {
      mo += 1
      if (mo > 12) {
        mo = 1
        yr += 1
      }
      return `${yr}-${String(mo).padStart(2, '0')}`
    })
  }
  const quarterly = lastPeriod?.match(/^(\d{4})-Q([1-4])$/)
  if (quarterly) {
    let yr = +quarterly[1]
    let q = +quarterly[2]
    return Array.from({ length: steps }, () => {
      q += 1
      if (q > 4) {
        q = 1
        yr += 1
      }
      return `${yr}-Q${q}`
    })
  }
  const fyQuarter = lastPeriod?.match(/^(\d{4})-(\d{2})-Q([1-4])$/i)
  if (fyQuarter) {
    let yr = +fyQuarter[1]
    let q = +fyQuarter[3]
    return Array.from({ length: steps }, () => {
      q += 1
      if (q > 4) {
        q = 1
        yr += 1
      }
      const next = String(yr + 1).slice(-2)
      return `${yr}-${next}-Q${q}`
    })
  }
  return Array.from({ length: steps }, (_, i) => `F${i + 1}`)
}

export type HwForecastResult = {
  periods: string[]
  history: { periods: string[]; values: number[] }
  forecast: {
    periods: string[]
    values: number[]
    lower_95: number[]
    upper_95: number[]
  }
  accuracy: AccuracyMetrics
  params: {
    alpha: number
    beta: number
    gamma: number
    m: number
    coefMode: HwCoefMode
    trendKind: HwTrendKind
    seasonalKind: HwSeasonalKind
    holdout: number
  }
}

export function hwForecast(
  periods: string[],
  values: number[],
  opts: { m: number; forecastSteps: number; holdout?: number; constraints?: HwConstraints },
): HwForecastResult | null {
  const c = opts.constraints ?? DEFAULT_HW_CONSTRAINTS
  const m = c.m && c.m > 0 ? Math.floor(c.m) : opts.m
  const forecastSteps =
    c.forecastSteps && c.forecastSteps > 0 ? Math.floor(c.forecastSteps) : opts.forecastSteps
  const holdoutReq =
    c.holdout != null && c.holdout >= 0 ? Math.floor(c.holdout) : (opts.holdout ?? forecastSteps)
  const n = values.length

  if (!m || forecastSteps <= 0) return null
  if (c.seasonalKind !== 'none' && n < 2 * m) return null
  if (c.seasonalKind === 'none' && n < 4) return null

  const minTrainForSeasonal = c.seasonalKind === 'none' ? 4 : 2 * m
  const effectiveHoldout = Math.max(0, Math.min(holdoutReq, n - minTrainForSeasonal))

  let alpha = c.alpha
  let beta = c.beta
  let gamma = c.gamma
  let trendKind: HwTrendKind = c.trendKind
  let seasonalKind: HwSeasonalKind = c.seasonalKind

  if (c.coefMode === 'manual') {
    alpha = _clamp01(c.alpha)
    beta = _clamp01(c.beta)
    gamma = _clamp01(c.gamma)
  } else if (c.coefMode === 'autostats') {
    const pick = _autostats(values, m, trendKind, seasonalKind)
    if (pick) {
      alpha = pick.alpha
      beta = pick.beta
      gamma = pick.gamma
      trendKind = pick.trendKind
      seasonalKind = pick.seasonalKind
    } else {
      return null
    }
  } else if (c.coefMode === 'grid') {
    const pick = _gridSearch(values, m, trendKind, seasonalKind, _GRID_ALPHAS, _GRID_BETAS, _GRID_GAMMAS)
    if (pick) {
      alpha = pick.alpha
      beta = pick.beta
      gamma = pick.gamma
    } else {
      return null
    }
  } else {
    // optimized (default)
    const pick = _gridSearch(
      values,
      m,
      trendKind,
      seasonalKind,
      _OPTIMIZED_ALPHAS,
      _OPTIMIZED_BETAS,
      _OPTIMIZED_GAMMAS,
    )
    if (pick) {
      alpha = pick.alpha
      beta = pick.beta
      gamma = pick.gamma
    } else {
      return null
    }
  }

  let accuracy: AccuracyMetrics = { mae: null, rmse: null, mape_pct: null, overall_accuracy_pct: null }
  if (effectiveHoldout > 0) {
    const trainVals = values.slice(0, n - effectiveHoldout)
    const testVals = values.slice(n - effectiveHoldout)
    const holdoutRes = _hwRun(trainVals, m, alpha, beta, gamma, trendKind, seasonalKind)
    if (holdoutRes) {
      accuracy = _metrics(testVals, holdoutRes.getForecast(effectiveHoldout))
    }
  }

  const full = _hwRun(values, m, alpha, beta, gamma, trendKind, seasonalKind)
  if (!full) return null

  const fcValues = full.getForecast(forecastSteps)
  const fcPeriods = _nextPeriods(periods[n - 1], forecastSteps)

  // Residuals on the in-sample fit window (skips initialisation window).
  const startT = seasonalKind === 'none' ? 1 : m
  const residuals: number[] = []
  for (let t = startT; t < n; t++) {
    const f = full.fitted[t]
    if (f !== null) residuals.push(values[t] - f)
  }
  const sigma =
    residuals.length > 1
      ? Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length)
      : Math.abs(values[n - 1]) * 0.05

  return {
    periods: [...periods, ...fcPeriods],
    history: { periods: [...periods], values: [...values] },
    forecast: {
      periods: fcPeriods,
      values: fcValues,
      lower_95: fcValues.map((v, h) => v - 1.96 * sigma * Math.sqrt(h + 1)),
      upper_95: fcValues.map((v, h) => v + 1.96 * sigma * Math.sqrt(h + 1)),
    },
    accuracy,
    params: {
      alpha,
      beta,
      gamma,
      m,
      coefMode: c.coefMode,
      trendKind: full.trendKind,
      seasonalKind: full.seasonalKind,
      holdout: effectiveHoldout,
    },
  }
}
