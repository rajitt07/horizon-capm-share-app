/**
 * Aggressive fund name fingerprint for cross-source matching (performance ↔ AMFI).
 * Lowercase tokens, drop noise words, join alphanumerics (no spaces/punctuation).
 */
const NOISE_WORDS = new Set([
  "direct",
  "plan",
  "growth",
  "dividend",
  "idcw",
  "dir",
  "regular",
  "option"
]);

/** Lowercase, strip noise tokens, join alphanumerics — use for performance ↔ NAV joins. */
export function normalize(name: string): string {
  return ultimateFundFingerprint(name);
}

export function ultimateFundFingerprint(name: string): string {
  let s = String(name).toLowerCase();
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/\[[^\]]*\]/g, " ");
  s = s.replace(/\s*-\s*/g, " ");
  s = s.replace(/[^a-z0-9]+/g, " ");
  const tokens = s.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const t of tokens) {
    if (NOISE_WORDS.has(t)) continue;
    if (t === "g") continue;
    out.push(t);
  }
  return out.join("");
}

/** Trigram overlap score in [0,1] for fuzzy "common keyword" matching (e.g. ABSL vs long AMFI name). */
export function commonKeywordOverlapScore(a: string, b: string): number {
  if (!a.length || !b.length) return 0;
  const trigrams = (s: string): Set<string> => {
    if (s.length < 3) return new Set([s]);
    const out = new Set<string>();
    for (let i = 0; i <= s.length - 3; i++) out.add(s.slice(i, i + 3));
    return out;
  };
  const A = trigrams(a);
  const B = trigrams(b);
  let inter = 0;
  for (const x of A) {
    if (B.has(x)) inter++;
  }
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}
