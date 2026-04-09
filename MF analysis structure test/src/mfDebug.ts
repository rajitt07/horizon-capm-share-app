export type MFDebugProcessStep = {
  step: number;
  name: string;
  ok: boolean;
  detail?: string;
};

export type MFDebugMatchEntry = Record<string, unknown>;

export type MFDebugPayload = {
  updatedAt: string;
  resolvedFetchUrl: string;
  proxyNote: string;
  rawPerformanceData: Array<Record<string, unknown>>;
  rawNavData: Array<Record<string, unknown>>;
  matchLog: MFDebugMatchEntry[];
  steps: MFDebugProcessStep[];
};

export type DebugDataPayload = {
  raw_perf_rows: Array<Record<string, unknown>>;
  raw_nav_rows: Array<Record<string, unknown>>;
  match_count: number;
};

declare global {
  interface Window {
    MF_DEBUG?: MFDebugPayload;
    DEBUG_DATA?: DebugDataPayload;
  }
}

export function setMFDebug(payload: MFDebugPayload | null): void {
  if (typeof window === "undefined") return;
  window.MF_DEBUG = payload ?? undefined;
}

export function setDebugData(payload: DebugDataPayload | null): void {
  if (typeof window === "undefined") return;
  window.DEBUG_DATA = payload ?? undefined;
}
