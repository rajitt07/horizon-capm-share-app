export type ITimeframeYears = "1" | "3" | "5" | "10";

export type IUiMode = "previous" | "latest" | "both";

export type ISchemeKey = string;

export interface INavData {
  schemeKey: ISchemeKey;
  schemeName: string;
  dateMs: number;
  nav: number;
}

export interface IPerformance {
  schemeKey: ISchemeKey;
  schemeName: string;
  schemeCode?: string | null;
  category?: string | null;
  benchmarkName?: string | null;
  returnsDirectByHorizon: Partial<Record<ITimeframeYears, number | null>>;
  returnsBenchmarkByHorizon: Partial<Record<ITimeframeYears, number | null>>;
  aumCr?: number | null;
  infoRatioDirectByHorizon?: Partial<Record<ITimeframeYears, number | null>>;
  /** Parsed from perf column “Return Since Launch Direct Benchmark” when present. */
  returnSinceLaunchDirectBenchmarkPct?: number | null;
}

export interface ITer {
  schemeKey: ISchemeKey;
  schemeName: string;
  terDirectPct?: number | null;
}

export interface IFund {
  schemeKey: ISchemeKey;
  schemeName: string;
  schemeCode?: string | null;
  category?: string | null;
  benchmarkName?: string | null;
  returnsDirectByHorizon: Record<ITimeframeYears, number | null>;
  returnsBenchmarkByHorizon: Record<ITimeframeYears, number | null>;
  alphaByHorizon: Record<ITimeframeYears, number | null>;
  terDirectPct?: number | null;
  aumCr?: number | null;
  navStdDevRebasedByHorizon?: Partial<Record<ITimeframeYears, number | null>>;
  /** Parsed from perf column "Information Ratio* {horizon} Year (Direct)" when present. */
  infoRatioDirectByHorizon: Record<ITimeframeYears, number | null>;
  /** Parsed from perf column “Return Since Launch Direct Benchmark” when present. */
  returnSinceLaunchDirectBenchmarkPct: number | null;
  /** `webkitRelativePath || name` of the performance file that last supplied this row (merge order). */
  perfSourceFileLabel?: string | null;
}

export interface IJoinedFund extends IFund {
  navStdDevRebasedByHorizon: Partial<Record<ITimeframeYears, number | null>>;
}

export interface INavStats {
  navStdDevRebased: number | null;
  chartPoints?: Array<{ x: number; y: number }>;
  baseDateMs?: number | null;
}

export interface ICategoryStats {
  avgReturnDirect: number | null;
  avgTER: number | null;
  avgAlpha: number | null;
  /** Mean of non-null Information Ratio (Direct) at the active horizon for funds in category. */
  avgInfoRatioDirect: number | null;
}

export interface IScoreCondition {
  id: string;
  title: string;
  caption: string;
  pass: boolean;
}

export interface IFundRankingSnapshot {
  score: number;
  total: number;
  conditions: IScoreCondition[];
  /** False when any input needed for the five score checks is missing (NA) — fund is excluded from category rank / score ordering. */
  rankable: boolean;
  /** Human-readable names of the specific inputs that are null/NA, causing rankable=false. Empty when rankable=true. */
  missingInputs: string[];
}

export interface IBucketStatus {
  stage: "idle" | "loading" | "ready" | "error";
  message?: string;
  files?: {
    performance?: boolean;
    ter?: boolean;
  };
}

export interface IBucketData {
  name: string;
  fundsByKey: Map<ISchemeKey, IJoinedFund>;
  horizons: ITimeframeYears[];
  status: IBucketStatus;
  rankingsByHorizon?: Partial<Record<ITimeframeYears, Map<ISchemeKey, IFundRankingSnapshot>>>;
}
