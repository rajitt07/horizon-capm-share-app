import React, { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { IBucketData, IJoinedFund, ITimeframeYears } from "../data/types";
import type { MetricsEngine } from "../data/metrics";
import { compareByScoreReturnAlphaWithRankable } from "../data/peerSuggestions";

export function LeaderboardPanel(props: {
  open: boolean;
  onClose: () => void;
  bucketSide: IBucketData;
  bucketPrevious: IBucketData;
  bucketLatest: IBucketData;
  selectedCategory: string;
  timeframeYears: ITimeframeYears;
  engine: MetricsEngine;
}) {
  const { open, onClose, bucketSide, bucketPrevious, bucketLatest, selectedCategory, timeframeYears, engine } = props;

  const ranked = useMemo(() => {
    const map = bucketSide.rankingsByHorizon?.[timeframeYears];
    const rows: Array<{ fund: IJoinedFund; score: number; rankable: boolean }> = [];
    if (map && map.size > 0) {
      for (const fund of bucketSide.fundsByKey.values()) {
        if (selectedCategory && fund.category !== selectedCategory) continue;
        const cat = fund.category ?? "";
        if (!cat) continue;
        const snap = map.get(fund.schemeKey);
        if (!snap) continue;
        rows.push({ fund, score: snap.score, rankable: snap.rankable ?? false });
      }
    } else {
      for (const fund of bucketSide.fundsByKey.values()) {
        if (selectedCategory && fund.category !== selectedCategory) continue;
        const cat = fund.category ?? "";
        if (!cat) continue;
        const details = engine.computeScoreDetails({
          bucketSide,
          schemeKey: fund.schemeKey,
          category: cat,
          horizonYears: timeframeYears,
          bucketPrevious,
          bucketLatest
        });
        rows.push({ fund, score: details.score, rankable: details.rankable });
      }
    }
    rows.sort((a, b) =>
      compareByScoreReturnAlphaWithRankable(a.score, a.fund, a.rankable, b.score, b.fund, b.rankable, timeframeYears)
    );
    return rows;
  }, [bucketSide, bucketPrevious, bucketLatest, selectedCategory, timeframeYears, engine]);

  const catRankByKey = useMemo(() => {
    const m = new Map<string, { rank: number; total: number }>();
    const byCat = new Map<string, Array<{ fund: IJoinedFund; score: number; rankable: boolean }>>();
    for (const row of ranked) {
      const c = row.fund.category?.trim();
      if (!c) continue;
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c)!.push(row);
    }
    for (const list of byCat.values()) {
      const rankableOnly = list.filter((r) => r.rankable);
      const total = rankableOnly.length;
      for (let i = 0; i < rankableOnly.length; i++) {
        m.set(rankableOnly[i].fund.schemeKey, { rank: i + 1, total });
      }
    }
    return m;
  }, [ranked]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal
          aria-label="Fund rankings"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            className="terminal-panel font-terminal max-h-[min(85vh,720px)] w-full max-w-2xl overflow-hidden rounded-2xl border border-white/[0.08] bg-black shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent-warn">Leaderboard</div>
                <div className="text-xs text-neutral-500 mt-0.5">
                  {timeframeYears}Y · 5-point rule · {ranked.length} funds
                </div>
              </div>
              <button type="button" className="ghost-button text-xs py-1 px-3" onClick={onClose}>
                Close
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-3 space-y-1">
              {ranked.length === 0 ? (
                <div className="text-sm text-neutral-500 py-8 text-center">No funds in this view.</div>
              ) : (
                ranked.map(({ fund, score, rankable }) => {
                  const catMeta = catRankByKey.get(fund.schemeKey);
                  return (
                    <div
                      key={fund.schemeKey}
                      className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-black/50 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-neutral-100 text-sm truncate">{fund.schemeName}</div>
                        <div className="text-[10px] text-neutral-500 truncate">{fund.category ?? "—"}</div>
                      </div>
                      <span className="shrink-0 text-[10px] text-neutral-500 font-mono tabular-nums text-right w-[4.5rem]">
                        {catMeta ? `Cat ${catMeta.rank}/${catMeta.total}` : "—"}
                      </span>
                      <span className="shrink-0 rounded-md border border-accent-warn/35 bg-accent-warn/10 px-2.5 py-1 text-xs font-bold text-amber-200 font-mono tabular-nums">
                        {rankable ? `Score: ${score}/5` : "NR"}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
