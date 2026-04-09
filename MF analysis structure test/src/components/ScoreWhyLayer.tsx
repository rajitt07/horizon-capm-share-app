import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { IScoreCondition } from "../data/types";

function trendForPair(prevPass: boolean, latestPass: boolean): "up" | "down" | null {
  if (!prevPass && latestPass) return "up";
  if (prevPass && !latestPass) return "down";
  return null;
}

export function ScoreWhyLayer(props: {
  open: boolean;
  position: { top: number; left: number } | null;
  onClose: () => void;
  conditions: IScoreCondition[];
  fundName: string;
  conditionsPrev?: IScoreCondition[];
  conditionsLatest?: IScoreCondition[];
}) {
  const { open, position, onClose, conditions, fundName, conditionsPrev, conditionsLatest } = props;
  const panelRef = useRef<HTMLDivElement>(null);

  const dual =
    conditionsPrev &&
    conditionsLatest &&
    conditionsPrev.length > 0 &&
    conditionsLatest.length > 0;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      onClose();
    };
    const id = window.setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  const byId = (list: IScoreCondition[]) => new Map(list.map((c) => [c.id, c]));

  return createPortal(
    <AnimatePresence>
      {open && position ? (
        <motion.div
          key="why-popover-root"
          className="fixed inset-0 z-[10040]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div
            className="absolute inset-0 bg-[#020617]/75 backdrop-blur-sm"
            aria-hidden
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-label={`Ranking breakdown for ${fundName}`}
            initial={{ opacity: 0, y: 10, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              zIndex: 1
            }}
            className="w-[min(calc(100vw-16px),520px)] rounded-xl border border-white/10 bg-[#0a0f1a]/95 p-4 shadow-[0_24px_64px_rgba(0,0,0,0.65)] ring-1 ring-white/5 backdrop-blur-xl"
          >
          <div className="font-terminal text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400/90">Why this score?</div>
          <div className="mt-1 text-xs font-medium text-slate-200 truncate" title={fundName}>
            {fundName}
          </div>

          {dual ? (
            <div
              className="mt-3 grid gap-x-2 gap-y-0 text-[10px]"
              style={{ gridTemplateColumns: "minmax(0,1.35fr) auto auto auto" }}
            >
              <div className="border-b border-slate-800/80 pb-1.5 font-semibold uppercase tracking-wider text-slate-500">
                Condition
              </div>
              <div className="border-b border-slate-800/80 pb-1.5 text-center font-semibold uppercase tracking-wider text-slate-500">
                Prev
              </div>
              <div className="border-b border-slate-800/80 pb-1.5 text-center font-semibold uppercase tracking-wider text-slate-500">
                Latest
              </div>
              <div className="border-b border-slate-800/80 pb-1.5 text-center font-semibold uppercase tracking-wider text-slate-500">
                Δ
              </div>
              {conditionsLatest!.map((cl) => {
                const cp = byId(conditionsPrev!).get(cl.id);
                const trend = cp ? trendForPair(cp.pass, cl.pass) : null;
                return (
                  <React.Fragment key={cl.id}>
                    <div className="border-b border-slate-800/40 py-2 pr-1 text-[11px] font-medium leading-snug text-slate-200">
                      {cl.title}
                    </div>
                    <div className="border-b border-slate-800/40 py-2 text-center text-lg leading-none" aria-label={cp?.pass ? "Pass previous" : "Fail previous"}>
                      {cp ? (cp.pass ? <span className="text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.45)]">✅</span> : <span className="text-rose-400 drop-shadow-[0_0_8px_rgba(251,113,133,0.35)]">❌</span>) : "—"}
                    </div>
                    <div className="border-b border-slate-800/40 py-2 text-center text-lg leading-none" aria-label={cl.pass ? "Pass latest" : "Fail latest"}>
                      {cl.pass ? <span className="text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.45)]">✅</span> : <span className="text-rose-400 drop-shadow-[0_0_8px_rgba(251,113,133,0.35)]">❌</span>}
                    </div>
                    <div className="border-b border-slate-800/40 py-2 text-center font-mono text-base leading-none">
                      {trend === "up" ? (
                        <span className="text-emerald-400" title="Improved">
                          ↑
                        </span>
                      ) : trend === "down" ? (
                        <span className="text-rose-400" title="Worsened">
                          ↓
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {conditions.map((c) => (
                <li key={c.id} className="flex gap-2 text-[11px] leading-snug">
                  <span className="shrink-0 text-base leading-none pt-0.5" aria-hidden>
                    {c.pass ? <span className="text-emerald-400">✅</span> : <span className="text-rose-400">❌</span>}
                  </span>
                  <div>
                    <div className="font-semibold text-slate-100">{c.title}</div>
                    <div className="text-slate-500">{c.caption}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {!dual && conditions.length === 0 ? (
            <p className="mt-2 text-[11px] text-slate-500">No breakdown — fund data missing for scoring.</p>
          ) : null}
        </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
