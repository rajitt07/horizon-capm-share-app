export type AppDiagnosticsPayload = {
  updatedAt: string;
  performance_sample: Array<Record<string, unknown>>;
  total_funds: number;
};

export type LatestPerfData = {
  previousSample: Array<Record<string, unknown>>;
  latestSample: Array<Record<string, unknown>>;
};

declare global {
  interface Window {
    __APP_DIAGNOSTICS__?: AppDiagnosticsPayload;
    LATEST_PERF_DATA?: LatestPerfData;
  }
}

export function setAppDiagnostics(payload: AppDiagnosticsPayload | null): void {
  if (typeof window === "undefined") return;
  window.__APP_DIAGNOSTICS__ = payload ?? undefined;
}

export function setLatestDebugGlobals(payload: { perf: LatestPerfData | null }): void {
  if (typeof window === "undefined") return;
  window.LATEST_PERF_DATA = payload.perf ?? undefined;
}
