import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IBucketData, IFundRankingSnapshot, IJoinedFund, ITimeframeYears, IUiMode } from "../data/types";
import type { MetricsEngine } from "../data/metrics";
import {
  buildGlobalOrderedRows,
  compareByScoreReturnAlphaWithRankable,
  getFundRankMeta,
  orderPeersCategoryScope,
  orderPeersUniverseScope,
  type PeerScope
} from "../data/peerSuggestions";
import { categorySelectDisplayLabel } from "../utils/categoryDisplay";

function OptionLabel({ f, meta }: { f: IJoinedFund; meta: ReturnType<typeof getFundRankMeta> | undefined }) {
  const catPart = meta && meta.catRank != null && meta.catTotal != null ? `Cat ${meta.catRank}/${meta.catTotal}` : "Cat —";
  const scorePart = meta ? (meta.rankable ? `${meta.score}/5` : "NR") : null;
  return (
    <span className="flex flex-col gap-0.5 min-w-0">
      <span className="block text-slate-100 leading-snug">{f.schemeName}</span>
      {scorePart != null ? (
        <span className="block text-[10px] text-slate-500 leading-none">
          {scorePart} · {catPart}
        </span>
      ) : null}
    </span>
  );
}

/** Lower = stronger match (exact → prefix → word start → substring). No match = -1. */
function schemeNameMatchTier(schemeName: string, q: string): number {
  const n = schemeName.toLowerCase();
  const needle = q.trim().toLowerCase();
  if (!needle) return -1;
  if (n === needle) return 0;
  if (n.startsWith(needle)) return 1;
  const words = n.split(/[\s/,\-]+/).filter(Boolean);
  if (words.some((w) => w.startsWith(needle))) return 2;
  if (n.includes(needle)) return 3;
  return -1;
}

export function ControlsBar(props: {
  uiMode: IUiMode;
  onUiModeChange: (mode: IUiMode) => void;
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (c: string) => void;
  funds: IJoinedFund[];
  validSchemeKeysInBucket: ReadonlySet<string>;
  universeFundsForChips: IJoinedFund[];
  schemeSearchQuery: string;
  onSchemeSearchQueryChange: (q: string) => void;
  selectedSchemeKeys: string[];
  setSelectedSchemeKeys: React.Dispatch<React.SetStateAction<string[]>>;
  activeSchemeKey: string;
  setActiveSchemeKey: (k: string) => void;
  rankMode: boolean;
  onRankModeChange: (v: boolean) => void;
  onOpenLeaderboard?: () => void;
  maxSelected: number;
  canCompute: boolean;
  timeframeYears: ITimeframeYears;
  bucketSide: IBucketData;
  bucketPrevious: IBucketData;
  bucketLatest: IBucketData;
  engine: MetricsEngine;
  rankingsForHorizon: Map<string, IFundRankingSnapshot> | undefined;
}) {
  const {
    uiMode,
    onUiModeChange,
    categories,
    selectedCategory,
    onCategoryChange,
    funds,
    validSchemeKeysInBucket,
    universeFundsForChips,
    schemeSearchQuery,
    onSchemeSearchQueryChange,
    selectedSchemeKeys,
    setSelectedSchemeKeys,
    activeSchemeKey,
    setActiveSchemeKey,
    rankMode,
    onRankModeChange,
    onOpenLeaderboard,
    maxSelected,
    canCompute,
    timeframeYears,
    bucketSide,
    bucketPrevious,
    bucketLatest,
    engine,
    rankingsForHorizon
  } = props;

  const [candidateKey, setCandidateKey] = useState<string>("");
  /** Anchor for peer ordering: search pick, active chip, category filter, or scope buttons — not when Compare surfaces a peer. */
  const [peerAnchorKey, setPeerAnchorKey] = useState<string>("");
  const [peerScope, setPeerScope] = useState<PeerScope>("category");
  /** How many Compare clicks used for the current anchor/scope (max 2 peers surfaced). */
  const [compareSurfaced, setCompareSurfaced] = useState(0);
  /** When Compare adds a peer, selection changes — skip resetting compare step (see selectionSig effect). */
  const suppressCompareResetForPeerAddRef = useRef(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const comboRootRef = useRef<HTMLDivElement>(null);
  const browseRootRef = useRef<HTMLDivElement>(null);

  const fundByKeyUniverse = useMemo(() => {
    const m = new Map<string, IJoinedFund>();
    for (const f of universeFundsForChips) m.set(f.schemeKey, f);
    return m;
  }, [universeFundsForChips]);

  const globalOrderedRows = useMemo(
    () =>
      buildGlobalOrderedRows(bucketSide, bucketPrevious, bucketLatest, timeframeYears, engine, rankingsForHorizon),
    [bucketSide, bucketPrevious, bucketLatest, timeframeYears, engine, rankingsForHorizon]
  );

  const rankMetaByKey = useMemo(() => {
    const m = new Map<string, ReturnType<typeof getFundRankMeta>>();
    for (const f of fundByKeyUniverse.values()) {
      m.set(
        f.schemeKey,
        getFundRankMeta(
          f.schemeKey,
          f,
          globalOrderedRows,
          bucketSide,
          bucketPrevious,
          bucketLatest,
          timeframeYears,
          engine,
          rankingsForHorizon
        )
      );
    }
    return m;
  }, [
    fundByKeyUniverse,
    globalOrderedRows,
    bucketSide,
    bucketPrevious,
    bucketLatest,
    timeframeYears,
    engine,
    rankingsForHorizon
  ]);

  const selectedSet = useMemo(() => new Set(selectedSchemeKeys), [selectedSchemeKeys]);

  const eligiblePeers = useMemo(() => {
    const anchor = fundByKeyUniverse.get(peerAnchorKey);
    if (!peerAnchorKey || !anchor) return [];
    if (peerScope === "category") {
      const cat = anchor.category?.trim();
      if (!cat) return [];
      return orderPeersCategoryScope(peerAnchorKey, cat, globalOrderedRows, timeframeYears, selectedSet);
    }
    return orderPeersUniverseScope(peerAnchorKey, globalOrderedRows, timeframeYears, selectedSet);
  }, [peerAnchorKey, fundByKeyUniverse, peerScope, globalOrderedRows, timeframeYears, selectedSet]);

  const anchorHasCategory = Boolean(fundByKeyUniverse.get(peerAnchorKey)?.category?.trim());
  const atCapacity = selectedSchemeKeys.length >= maxSelected;
  const compareExhausted = compareSurfaced >= 2;
  const noPeerAtStep = compareSurfaced >= eligiblePeers.length;

  const compareDisabled =
    !canCompute ||
    !peerAnchorKey ||
    atCapacity ||
    compareExhausted ||
    noPeerAtStep ||
    (peerScope === "category" && !anchorHasCategory);

  const compareTitle = (() => {
    if (!canCompute) return "Run process first";
    if (!peerAnchorKey) return "Choose a fund in the dropdown as anchor";
    if (atCapacity) return `Selection full (${maxSelected} max)`;
    if (peerScope === "category" && !anchorHasCategory) return "Anchor fund has no category — use All categories or pick another fund";
    if (compareExhausted) return "Only two closest peers are available via Compare — change anchor or scope";
    if (noPeerAtStep) return "No more peers in this scope (already selected or none left)";
    return `Surface peer ${compareSurfaced + 1} of 2 (${peerScope === "category" ? "same category" : "all categories"}) · ${timeframeYears}Y`;
  })();

  const handleCompare = useCallback(() => {
    if (compareDisabled) return;
    const next = eligiblePeers[compareSurfaced];
    if (!next) return;
    suppressCompareResetForPeerAddRef.current = true;
    setSelectedSchemeKeys((prev) => {
      if (prev.includes(next)) return prev;
      if (prev.length >= maxSelected) return prev;
      return [...prev, next];
    });
    setActiveSchemeKey(next);
    setCandidateKey(next);
    setCompareSurfaced((s) => s + 1);
  }, [
    compareDisabled,
    eligiblePeers,
    compareSurfaced,
    maxSelected,
    setSelectedSchemeKeys,
    setActiveSchemeKey
  ]);

  useEffect(() => {
    setSelectedSchemeKeys((prev) => prev.filter((k) => validSchemeKeysInBucket.has(k)));
  }, [validSchemeKeysInBucket, setSelectedSchemeKeys]);

  useEffect(() => {
    if (!selectedSchemeKeys.length) {
      setActiveSchemeKey("");
      return;
    }
    if (activeSchemeKey && selectedSchemeKeys.includes(activeSchemeKey)) return;
    setActiveSchemeKey(selectedSchemeKeys[0]);
  }, [selectedSchemeKeys, activeSchemeKey, setActiveSchemeKey]);

  /**
   * Scheme search uses the full active-bucket universe (`universeFundsForChips`), not the category-filtered
   * `funds` prop — matches are ranked like typeahead (exact / prefix / word / substring), then by score.
   */
  const rankedSchemeSuggestions = useMemo(() => {
    const q = schemeSearchQuery.trim();
    if (!q || !canCompute) return [];
    const scored: Array<{ fund: IJoinedFund; tier: number }> = [];
    for (const f of universeFundsForChips) {
      const tier = schemeNameMatchTier(f.schemeName, q);
      if (tier < 0) continue;
      scored.push({ fund: f, tier });
    }
    scored.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      const ma = rankMetaByKey.get(a.fund.schemeKey);
      const mb = rankMetaByKey.get(b.fund.schemeKey);
      return compareByScoreReturnAlphaWithRankable(
        ma?.score ?? 0,
        a.fund,
        ma?.rankable ?? false,
        mb?.score ?? 0,
        b.fund,
        mb?.rankable ?? false,
        timeframeYears
      );
    });
    return scored.slice(0, 25).map((s) => s.fund);
  }, [universeFundsForChips, schemeSearchQuery, canCompute, rankMetaByKey, timeframeYears]);

  const pickFund = useCallback(
    (schemeKey: string, options?: { clearSearch?: boolean; closeSuggestions?: boolean }) => {
      const clearSearch = options?.clearSearch ?? false;
      const closeSuggestions = options?.closeSuggestions ?? false;
      if (!schemeKey || !fundByKeyUniverse.has(schemeKey)) return;
      const already = selectedSchemeKeys.includes(schemeKey);
      if (!already && selectedSchemeKeys.length >= maxSelected) {
        if (closeSuggestions) setSuggestionsOpen(false);
        return;
      }
      setCompareSurfaced(0);
      setPeerAnchorKey(schemeKey);
      setCandidateKey(schemeKey);
      if (!already) {
        setSelectedSchemeKeys((prev) => [...prev, schemeKey]);
      }
      setActiveSchemeKey(schemeKey);
      if (clearSearch) onSchemeSearchQueryChange("");
      if (closeSuggestions) setSuggestionsOpen(false);
    },
    [
      fundByKeyUniverse,
      maxSelected,
      onSchemeSearchQueryChange,
      selectedSchemeKeys,
      setActiveSchemeKey,
      setSelectedSchemeKeys
    ]
  );

  const pickFundFromSearch = useCallback(
    (schemeKey: string) => pickFund(schemeKey, { clearSearch: true, closeSuggestions: true }),
    [pickFund]
  );

  const pickFundFromBrowse = useCallback((schemeKey: string) => pickFund(schemeKey), [pickFund]);

  const pickFundFromBrowseDropdown = useCallback(
    (schemeKey: string) => {
      pickFundFromBrowse(schemeKey);
      setBrowseOpen(false);
    },
    [pickFundFromBrowse]
  );

  useEffect(() => {
    if (!suggestionsOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = comboRootRef.current;
      if (el && !el.contains(e.target as Node)) setSuggestionsOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [suggestionsOpen]);

  useEffect(() => {
    if (!browseOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = browseRootRef.current;
      if (el && !el.contains(e.target as Node)) setBrowseOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBrowseOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [browseOpen]);

  useEffect(() => {
    setPeerAnchorKey((k) => (k && fundByKeyUniverse.has(k) ? k : ""));
    setCandidateKey((k) => (k && fundByKeyUniverse.has(k) ? k : ""));
  }, [fundByKeyUniverse]);

  const selectionSig = selectedSchemeKeys.join("\0");
  useEffect(() => {
    if (suppressCompareResetForPeerAddRef.current) {
      suppressCompareResetForPeerAddRef.current = false;
      return;
    }
    setCompareSurfaced(0);
  }, [selectionSig]);

  const prevSelectedCategoryRef = useRef<string | undefined>(undefined);
  /** When the category filter value changes, reset dropdown candidate if it is not in the new category; align Compare anchor. */
  useEffect(() => {
    const prev = prevSelectedCategoryRef.current;
    prevSelectedCategoryRef.current = selectedCategory;
    if (prev !== undefined && prev === selectedCategory) return;

    const cat = selectedCategory.trim();
    setCompareSurfaced(0);

    setCandidateKey((ck) => {
      if (!cat) return ck;
      const f = ck ? fundByKeyUniverse.get(ck) : undefined;
      if (!ck || !f) return ck;
      return f.category?.trim() === cat ? ck : "";
    });

    if (!cat) return;
    const activeFund = activeSchemeKey ? fundByKeyUniverse.get(activeSchemeKey) : undefined;
    if (activeFund?.category?.trim() === cat) {
      setPeerAnchorKey(activeSchemeKey);
      return;
    }
    const match = selectedSchemeKeys.find((k) => fundByKeyUniverse.get(k)?.category?.trim() === cat);
    if (match) setPeerAnchorKey(match);
    else setPeerAnchorKey("");
  }, [selectedCategory, activeSchemeKey, selectedSchemeKeys, fundByKeyUniverse]);

  return (
    <div className="analytics-pill px-4 py-3">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mr-1">View</span>
            <button
              type="button"
              className={`ghost-button text-xs py-1.5 ${uiMode === "previous" ? "is-active" : ""}`}
              onClick={() => onUiModeChange("previous")}
            >
              Previous Month
            </button>
            <button
              type="button"
              className={`ghost-button text-xs py-1.5 ${uiMode === "latest" ? "is-active" : ""}`}
              onClick={() => onUiModeChange("latest")}
            >
              Latest Data
            </button>
            <button
              type="button"
              className={`ghost-button text-xs py-1.5 ${uiMode === "both" ? "is-active" : ""}`}
              onClick={() => onUiModeChange("both")}
            >
              Prev vs Latest
            </button>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <label className="text-[11px] text-slate-500">Category</label>
            <select
              className="horizon-select text-xs py-1.5"
              value={selectedCategory}
              onChange={(e) => onCategoryChange(e.target.value)}
              disabled={!canCompute}
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {categorySelectDisplayLabel(c)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="ghost-button text-xs py-1.5"
              onClick={() => onOpenLeaderboard?.()}
              disabled={!canCompute}
              title="Open leaderboard of all funds (5-point score)"
            >
              Rankings
            </button>
            <button
              type="button"
              className={`ghost-button text-xs py-1.5 ${rankMode ? "is-active" : ""}`}
              onClick={() => onRankModeChange(!rankMode)}
              disabled={!canCompute}
              title="Reorder comparison columns by score"
            >
              Sort columns
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-black/45 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Pick funds</div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-stretch gap-2">
              <div ref={comboRootRef} className="relative min-w-0 flex-1 basis-[min(100%,18rem)]">
                <input
                  className="peer-search w-full text-sm"
                  placeholder="Search scheme name…"
                  value={schemeSearchQuery}
                  onChange={(e) => {
                    onSchemeSearchQueryChange(e.target.value);
                    setSuggestionsOpen(true);
                    setBrowseOpen(false);
                  }}
                  onFocus={() => {
                    setSuggestionsOpen(true);
                    setBrowseOpen(false);
                  }}
                  disabled={!canCompute}
                  autoComplete="off"
                  aria-autocomplete="list"
                  aria-expanded={suggestionsOpen && rankedSchemeSuggestions.length > 0}
                  role="combobox"
                />
                {canCompute && suggestionsOpen && schemeSearchQuery.trim() ? (
                  <ul
                    className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-[min(50vh,360px)] overflow-y-auto rounded-lg border border-white/[0.12] bg-black/95 py-1 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-md"
                    role="listbox"
                  >
                    {rankedSchemeSuggestions.length === 0 ? (
                      <li className="px-3 py-2.5 text-xs text-slate-500">No matching schemes</li>
                    ) : (
                      rankedSchemeSuggestions.map((f) => (
                        <li key={f.schemeKey} role="option">
                          <button
                            type="button"
                            className="w-full px-3 py-2.5 text-left text-xs transition-colors hover:bg-white/[0.06] focus:bg-white/[0.08] focus:outline-none"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickFundFromSearch(f.schemeKey)}
                          >
                            <OptionLabel f={f} meta={rankMetaByKey.get(f.schemeKey)} />
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                ) : null}
              </div>
              <div
                className="inline-flex shrink-0 rounded-lg border border-white/[0.1] bg-black/50 p-0.5 self-center"
                role="group"
                aria-label="Peer scope for Compare"
              >
                <button
                  type="button"
                  className={`rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors ${
                    peerScope === "category"
                      ? "bg-emerald-500/20 text-emerald-200"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                  onClick={() => {
                    setPeerScope("category");
                    setCompareSurfaced(0);
                    setPeerAnchorKey(candidateKey);
                  }}
                  disabled={!canCompute}
                  title="Peers only in the anchor fund’s category"
                >
                  Same category
                </button>
                <button
                  type="button"
                  className={`rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors ${
                    peerScope === "universe"
                      ? "bg-emerald-500/20 text-emerald-200"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                  onClick={() => {
                    setPeerScope("universe");
                    setCompareSurfaced(0);
                    setPeerAnchorKey(candidateKey);
                  }}
                  disabled={!canCompute}
                  title="Peers from the full bucket (may cross categories)"
                >
                  All categories
                </button>
              </div>
              <button
                type="button"
                className="ghost-button text-xs py-1.5 px-2.5 shrink-0 self-center"
                disabled={compareDisabled}
                onClick={handleCompare}
                title={compareTitle}
                aria-label={compareTitle}
              >
                Compare
              </button>
            </div>

            <div className="text-[11px] text-slate-500">
              Selected {selectedSchemeKeys.length} / {maxSelected}
              {canCompute ? (
                <span className="text-slate-600">
                  {" "}
                  · Fund list is a dropdown (category-scoped); search matches any fund in the loaded bucket
                </span>
              ) : null}
              {canCompute && candidateKey ? (
                <span className="text-slate-600">
                  {" "}
                  · <span className="font-mono tabular-nums">{timeframeYears}Y</span> score and Cat in list
                </span>
              ) : null}
              {canCompute && peerAnchorKey && candidateKey && peerAnchorKey !== candidateKey ? (
                <span className="text-slate-600">
                  {" "}
                  · Compare ordering vs anchor: {fundByKeyUniverse.get(peerAnchorKey)?.schemeName ?? peerAnchorKey}
                </span>
              ) : null}
            </div>

            {canCompute && selectedCategory && !funds.length ? (
              <p className="text-[11px] text-amber-200/85 leading-snug">No funds in this category in the loaded data.</p>
            ) : null}

            {canCompute && funds.length > 0 ? (
              <div ref={browseRootRef} className="relative w-full">
                <button
                  type="button"
                  className="peer-search flex w-full items-center justify-between gap-2 text-left text-sm text-slate-200"
                  onClick={() => {
                    setBrowseOpen((o) => !o);
                    setSuggestionsOpen(false);
                  }}
                  aria-expanded={browseOpen}
                  aria-haspopup="listbox"
                  id="pick-funds-dropdown-trigger"
                >
                  <span className="min-w-0 truncate">
                    {selectedCategory
                      ? `${categorySelectDisplayLabel(selectedCategory)} — ${funds.length} funds`
                      : `All categories — ${funds.length} funds`}
                  </span>
                  <span
                    className={`shrink-0 text-[10px] text-slate-500 transition-transform duration-150 ${browseOpen ? "rotate-180" : ""}`}
                    aria-hidden
                  >
                    ▾
                  </span>
                </button>
                {browseOpen ? (
                  <ul
                    className="absolute left-0 right-0 top-full z-[58] mt-1 max-h-[min(55vh,420px)] overflow-y-auto rounded-lg border border-white/[0.12] bg-black/95 py-1 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-md"
                    role="listbox"
                    aria-labelledby="pick-funds-dropdown-trigger"
                    aria-label={selectedCategory ? "Funds in selected category" : "All funds in bucket"}
                  >
                    {funds.map((f) => {
                      const selected = selectedSet.has(f.schemeKey);
                      const atCap = selectedSchemeKeys.length >= maxSelected;
                      const disabledRow = !selected && atCap;
                      return (
                        <li key={f.schemeKey} role="option" aria-selected={selected}>
                          <button
                            type="button"
                            disabled={disabledRow}
                            className={[
                              "w-full px-3 py-2.5 text-left text-xs transition-colors",
                              selected
                                ? "bg-emerald-500/15"
                                : disabledRow
                                  ? "cursor-not-allowed opacity-40"
                                  : "hover:bg-white/[0.06] focus:bg-white/[0.08] focus:outline-none"
                            ].join(" ")}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickFundFromBrowseDropdown(f.schemeKey)}
                            title={
                              disabledRow
                                ? `Selection full (${maxSelected} max)`
                                : selected
                                  ? "Selected — click to set as active"
                                  : "Add to comparison"
                            }
                          >
                            <OptionLabel f={f} meta={rankMetaByKey.get(f.schemeKey)} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {selectedSchemeKeys.map((k) => {
                const f = fundByKeyUniverse.get(k);
                const chipActive = activeSchemeKey === k;
                const bothTint = uiMode === "both";
                return (
                  <button
                    key={k}
                    type="button"
                    className={[
                      "ghost-button text-xs py-1",
                      bothTint
                        ? chipActive
                          ? "!border-cyan-400/55 !text-cyan-100 bg-teal-950/45 shadow-[0_0_14px_rgba(34,211,238,0.12)]"
                          : "!border-cyan-500/30 !text-cyan-200/90 bg-teal-950/25 hover:!border-cyan-400/45 hover:bg-teal-950/40"
                        : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => {
                      setActiveSchemeKey(k);
                      setPeerAnchorKey(k);
                      setCandidateKey(k);
                      setCompareSurfaced(0);
                    }}
                    style={
                      bothTint
                        ? undefined
                        : {
                            borderColor: chipActive ? "rgba(74, 222, 128, 0.5)" : undefined,
                            color: chipActive ? "#86efac" : undefined
                          }
                    }
                    title="Chart emphasis"
                  >
                    <span className="mr-2">{f?.schemeName ?? k}</span>
                    <span
                      className="text-slate-500 font-bold"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectedSchemeKeys((prev) => prev.filter((x) => x !== k));
                      }}
                    >
                      ×
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
