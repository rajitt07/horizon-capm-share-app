/** Survives a second Process click (window hooks are cleared in App). */

export const DEBUG_SESSION_KEYS = {
  pipeline: "mf_debug_pipeline_last"
} as const;

function setJson(key: string, payload: Record<string, unknown>): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function persistPipelineDebug(payload: Record<string, unknown>): void {
  setJson(DEBUG_SESSION_KEYS.pipeline, payload);
}

export function clearAllDebugSession(): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    for (const k of Object.values(DEBUG_SESSION_KEYS)) {
      sessionStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

export function readDebugSnapshotFromSession(): {
  pipeline: Record<string, unknown> | null;
} {
  const parse = (key: string): Record<string, unknown> | null => {
    try {
      if (typeof sessionStorage === "undefined") return null;
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  };
  return {
    pipeline: parse(DEBUG_SESSION_KEYS.pipeline)
  };
}
