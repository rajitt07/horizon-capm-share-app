/** UI display only — keep canonical `fund.category` / `selectedCategory` unchanged for logic. */
export function categorySelectDisplayLabel(canonical: string): string {
  const t = canonical.replace(/^(Equity|Debt|Hybrid):\s*/i, "").trim();
  return t.length > 0 ? t : canonical;
}
