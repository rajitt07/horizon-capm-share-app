/**
 * Parent category → subcategory mapping.
 *
 * Each parent entry has a display label and the list of canonical subcategory
 * strings (the values stored in `fund.category`) that belong to it.
 *
 * Standalone entries (Large Cap, Flexi Cap, Hybrid, Debt, etc.) do NOT appear
 * here — they surface directly in the Sub-categories dropdown as-is.
 */

export interface IParentCategory {
  /** Label shown in the Parent Category dropdown. */
  label: string;
  /** Canonical subcategory strings (`fund.category`) included in this parent. */
  subCategories: string[];
}

export const PARENT_CATEGORIES: IParentCategory[] = [
  {
    label: "Financial Services",
    subCategories: ["Equity: Banking & Financial Services", "Equity: MNC"]
  },
  {
    label: "BANKEX",
    subCategories: ["Equity: Banking & Financial Services", "Equity: PSU Banks"]
  },
  {
    label: "Healthcare",
    subCategories: ["Equity: Pharma & Healthcare"]
  },
  {
    label: "Hospitals",
    subCategories: ["Equity: Hospitals"]
  },
  {
    label: "Information Technology",
    subCategories: ["Equity: Technology", "Equity: Digital India", "Equity: Innovation", "Equity: MNC"]
  },
  {
    label: "Telecommunication",
    subCategories: ["Equity: Telecommunication"]
  },
  {
    label: "Industrials",
    subCategories: ["Equity: Infrastructure", "Equity: Manufacturing", "Equity: Defence"]
  },
  {
    label: "CAPITAL GOODS",
    subCategories: ["Equity: Manufacturing", "Equity: Defence"]
  },
  {
    label: "Consumer Discretionary",
    subCategories: ["Equity: Consumption", "Equity: Rural"]
  },
  {
    label: "AUTO",
    subCategories: ["Equity: Automotive"]
  },
  {
    label: "CONSUMER DURABLES",
    subCategories: ["Equity: Consumption"]
  },
  {
    label: "Fast Moving Consumer Goods",
    subCategories: ["Equity: FMCG"]
  },
  {
    label: "Energy",
    subCategories: ["Equity: Resources & Energy"]
  },
  {
    label: "Commodities",
    subCategories: ["Equity: Commodities"]
  },
  {
    label: "Utilities",
    subCategories: ["Equity: PSU", "Equity: Housing"]
  },
  {
    label: "REALTY",
    subCategories: ["Equity: Housing"]
  },
  {
    label: "Services",
    subCategories: [
      "Equity: Services",
      "Equity: Exports & Services",
      "Equity: Transportation & Logistics"
    ]
  }
];

/**
 * Set of all subcategory strings that are claimed by at least one parent.
 * Subcategories NOT in this set are "standalone" and appear directly in the
 * Sub-categories dropdown without any parent grouping.
 */
export const PARENT_CLAIMED_SUB_CATEGORIES = new Set<string>(
  PARENT_CATEGORIES.flatMap((p) => p.subCategories)
);

/**
 * Returns the subcategory strings for a given parent label, or null if the
 * label doesn't match any parent (meaning it is itself a standalone entry).
 */
export function getSubCategoriesForParent(parentLabel: string): string[] | null {
  const entry = PARENT_CATEGORIES.find((p) => p.label === parentLabel);
  return entry ? entry.subCategories : null;
}

/**
 * Returns true when `cat` is covered by at least one parent category.
 */
export function isCoveredByParent(cat: string): boolean {
  return PARENT_CLAIMED_SUB_CATEGORIES.has(cat);
}
