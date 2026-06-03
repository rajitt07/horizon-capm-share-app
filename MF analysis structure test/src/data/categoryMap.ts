/**
 * Content-based canonical categories — no reliance on source filenames.
 * Combines section headers from spreadsheets with keyword fallbacks on scheme names.
 */

const CANON = {
  equityLarge: "Equity: Large Cap",
  /** Distinct from Large Cap and Mid Cap — rules must run before those. */
  equityLargeMid: "Equity: Large & Mid Cap",
  equityMid: "Equity: Mid Cap",
  equitySmall: "Equity: Small Cap",
  equityFlexi: "Equity: Flexi Cap",
  equityMulti: "Equity: Multi Cap",
  equityValue: "Equity: Value",
  /** Style / factor tilt — distinct from Value and Factor & Smart Beta. */
  equityQuality: "Equity: Quality",
  equityELSS: "Equity: ELSS",
  equityDividendYield: "Equity: Dividend Yield",
  equityIndex: "Equity: Index / ETF",
  hybridAgg: "Hybrid: Aggressive",
  hybridBal: "Hybrid: Balanced",
  hybridCons: "Hybrid: Conservative",
  debtLiquid: "Debt: Liquid",
  debtUltra: "Debt: Ultra Short Duration",
  debtShort: "Debt: Short Duration",
  debtMoney: "Debt: Money Market",
  debtLong: "Debt: Long Duration",
  solution: "Solution Oriented",
  other: "Other",
  unclassified: "Unclassified",
  /** Thematic / sector equity — name-based when file says Unclassified or Equity: Other */
  equityThematicBankingFinancial: "Equity: Banking & Financial Services",
  equityThematicPharmaHealthcare: "Equity: Pharma & Healthcare",
  equityThematicTransportLogistics: "Equity: Transportation & Logistics",
  equityThematicSpecialOpportunities: "Equity: Special Opportunities",
  equityThematicBusinessCycle: "Equity: Business Cycle",
  equityThematicConglomerate: "Equity: Conglomerate",
  equityThematicInfrastructure: "Equity: Infrastructure",
  equityThematicConsumption: "Equity: Consumption",
  equityThematicInnovation: "Equity: Innovation",
  equityThematicQuant: "Equity: Quant",
  equityThematicResourcesEnergy: "Equity: Resources & Energy",
  equityThematicEthical: "Equity: Ethical",
  equityThematicManufacturing: "Equity: Manufacturing",
  equityThematicAutomotive: "Equity: Automotive",
  equityThematicPSU: "Equity: PSU",
  equityThematicCommodities: "Equity: Commodities",
  equityThematicFactorSmartBeta: "Equity: Factor & Smart Beta",
  equityThematicMultiFactor: "Equity: Multi-Factor",
  equityThematicESG: "Equity: ESG",
  equityThematicMNC: "Equity: MNC",
  equityThematicTechnology: "Equity: Technology",
  equityThematicInternational: "Equity: International",
  equityThematicDigitalIndia: "Equity: Digital India",
  equityThematicHousing: "Equity: Housing",
  equityThematicDefence: "Equity: Defence",
  equityThematicRural: "Equity: Rural",
  equityThematicExportsServices: "Equity: Exports & Services",
  equityThematicIndiaOpportunities: "Equity: India Opportunities",
  equityThematicIPO: "Equity: IPO",
  equityThematicSectorRotation: "Equity: Sector rotation",
  equityThematicFMCG: "Equity: FMCG",
  equityThematicServices: "Equity: Services",
  equityThematicDiversified: "Equity: Diversified",
  /** Separate from Pharma & Healthcare — specifically hospital-sector funds. */
  equityThematicHospitals: "Equity: Hospitals",
  /** Telecom-sector equity funds. */
  equityThematicTelecommunication: "Equity: Telecommunication",
  /** PSU bank-specific equity funds (distinct from broad PSU). */
  equityThematicPSUBanks: "Equity: PSU Banks"
} as const;

/** Normalize AMFI-style section banners (e.g. "EQUITY : LARGE CAP", "Debt Schemes"). */
export function normalizeSectionHeader(raw: string): string | null {
  const s = raw.replace(/\s+/g, " ").replace(/^[*•\s]+/, "").trim();
  if (!s) return null;

  const noSchemes = s.replace(/\s+schemes$/i, "").trim();
  const t = noSchemes.toLowerCase();

  if (
    /^equity\s*:\s*large\s*&\s*mid\b/.test(t) ||
    /^equity\s*:\s*large\s+and\s+mid\b/.test(t) ||
    /\blarge\s*&\s*mid\s*cap\b/.test(t) ||
    /\blarge\s+and\s+mid\s*cap\b/.test(t) ||
    /\blarge\s*\/\s*mid\s*cap\b/.test(t)
  ) {
    return CANON.equityLargeMid;
  }
  if (/^equity\s*:\s*large/.test(t) || /\blarge\s*cap\b/.test(t)) return CANON.equityLarge;
  if (/^equity\s*:\s*mid/.test(t) || /\bmid\s*cap\b/.test(t)) return CANON.equityMid;
  if (/^equity\s*:\s*small/.test(t) || /\bsmall\s*cap\b/.test(t)) return CANON.equitySmall;
  if (/flexi/.test(t)) return CANON.equityFlexi;
  if (/multi[\s-]*cap|multi\s+cap/.test(t)) return CANON.equityMulti;
  if (/value/.test(t) && /equity|cap|fund/.test(t)) return CANON.equityValue;
  if (/elss|tax\s*saving|80c/.test(t)) return CANON.equityELSS;
  if (/dividend\s*yield/.test(t)) return CANON.equityDividendYield;
  if (/multi[\s-]*factor/.test(t)) return CANON.equityThematicMultiFactor;
  if (/\bquality\b/.test(t) && /equity|fund|cap|scheme/.test(t)) return CANON.equityQuality;
  if (/index|etf|nifty\s*50|sensex/.test(t)) return CANON.equityIndex;

  if (/hybrid|balanced/.test(t)) {
    if (/aggressive|dynamic/.test(t)) return CANON.hybridAgg;
    if (/conservative|conserv/.test(t)) return CANON.hybridCons;
    return CANON.hybridBal;
  }

  if (/liquid|overnight|money\s*market/.test(t)) {
    if (/overnight/.test(t)) return CANON.debtLiquid;
    if (/money/.test(t)) return CANON.debtMoney;
    return CANON.debtLiquid;
  }
  if (/ultra\s*short/.test(t)) return CANON.debtUltra;
  if (/short\s*duration|low\s*duration/.test(t)) return CANON.debtShort;
  if (/gilt|long\s*duration|corporate\s*bond|credit\s*risk|banking\s*&\s*psu/.test(t)) return CANON.debtLong;

  if (/solution|retirement|children|goal/.test(t)) return CANON.solution;

  if (/^equity$/i.test(noSchemes) || /^debt$/i.test(noSchemes) || /^hybrid$/i.test(noSchemes)) return null;

  if (
    /^equity\s*:\s*international\b/.test(t) ||
    /^foreign\b/.test(t) ||
    /^overseas\b/.test(t) ||
    /^global\s+equity\b/.test(t)
  ) {
    return CANON.equityThematicInternational;
  }
  if (/^equity\s*:\s*digital\b/.test(t) || /digital\s+india|digital\s+bharat/.test(t)) {
    return CANON.equityThematicDigitalIndia;
  }

  if (/equity/.test(t) && !/debt|hybrid/.test(t)) return "Equity: Other";
  if (/debt|fixed\s*income|income/.test(t)) return "Debt: Other";
  return null;
}

/** True when the label is a catch-all bucket — scheme name may refine it (e.g. Unclassified → Quant). */
function isRefinableGenericCategory(label: string): boolean {
  const t = label.trim().toLowerCase();
  return (
    t === CANON.unclassified.toLowerCase() ||
    t === CANON.other.toLowerCase() ||
    t === "equity: other"
  );
}

/**
 * Sector / thematic equity from scheme name. Runs after cap style, ELSS, index, hybrid, etc.
 * Order: specific phrases before loose tokens; avoid debt "Banking & PSU" (not matched here).
 */
function inferThematicEquityCategoryFromFundName(schemeName: string): string | null {
  const n = schemeName.toLowerCase();

  if (/\bbanking\s*&\s*psu\b|\bbanking\s+and\s+psu\b/.test(n)) return null;

  // PSU Banks must run before generic PSU so "PSU Bank Fund" → PSU Banks, not PSU.
  if (
    /\bpsu\s+bank\b/.test(n) ||
    /\bpsu\s+banking\b/.test(n) ||
    /\bpublic\s+sector\s+bank/.test(n) ||
    /\bpsb\b/.test(n)
  ) {
    return CANON.equityThematicPSUBanks;
  }

  // Hospitals must run before Pharma & Healthcare so "Nifty India Hospitals" → Hospitals.
  if (/\bhospitals?\b/.test(n)) {
    return CANON.equityThematicHospitals;
  }

  if (
    /\bbfsi\b/.test(n) ||
    /\bbanking\s*&\s*financial\b/.test(n) ||
    /\bbanking\s+and\s+financial\b/.test(n) ||
    /\bfinancial\s+services\b/.test(n)
  ) {
    return CANON.equityThematicBankingFinancial;
  }

  /** Before "India opportunities" — US / Taiwan / Japan / Asia / International. */
  if (
    /\binternational\s+equity\b/.test(n) ||
    /\btaiwan\b/.test(n) ||
    /\bjapan\b/.test(n) ||
    /\basian\s+equity\b/.test(n) ||
    /\bus\s+bluechip\b/.test(n) ||
    /\bus\s+equity\b/.test(n)
  ) {
    return CANON.equityThematicInternational;
  }

  if (
    /\bpharma\b|\bpharmaceutical\b|\bhealthcare\b|\bdiagnostics?\b|\bwellness\b|\bhealth\s+and\s+wellness\b|\bhealth\s*&\s*wellness\b/.test(
      n
    )
  ) {
    return CANON.equityThematicPharmaHealthcare;
  }

  if (/\bmulti[\s-]*factor\b/.test(n)) {
    return CANON.equityThematicMultiFactor;
  }

  if (/\bquality\s+fund\b|\bquality\s+equity\b|\bequity\s+quality\b/.test(n)) {
    return CANON.equityQuality;
  }

  if (/\btransportation\s+and\s+logistics\b|\btransportation\s*&\s*logistics\b|\btransport\s+and\s+logistics\b/.test(n)) {
    return CANON.equityThematicTransportLogistics;
  }

  if (/\bspecial\s+opportunit(?:y|ies)\b/.test(n)) return CANON.equityThematicSpecialOpportunities;
  if (/\bbusiness\s+cycles?\b/.test(n)) return CANON.equityThematicBusinessCycle;
  if (/\bconglomerates?\b/.test(n)) return CANON.equityThematicConglomerate;

  if (
    /\binfrastructure\b/.test(n) ||
    /\bbuild\s+india\b/.test(n) ||
    /\bpower\s*&\s*infra\b/.test(n) ||
    /\bpower\s+and\s+infra\b/.test(n) ||
    /t\.?\s*i\.?\s*g\.?\s*e\.?\s*r/.test(n)
  ) {
    return CANON.equityThematicInfrastructure;
  }

  if (/\bhousing\s+opportunit(?:y|ies)\b/.test(n)) return CANON.equityThematicHousing;
  if (/\bdefence\b|\bdefense\b/.test(n)) return CANON.equityThematicDefence;
  if (/\brural\b/.test(n)) return CANON.equityThematicRural;

  if (
    /\bexports\s+and\s+services\b/.test(n) ||
    /\bexport\s+opportunit(?:y|ies)\b/.test(n) ||
    /\bindia\s+export\b/.test(n)
  ) {
    return CANON.equityThematicExportsServices;
  }

  if (/\bindia\s+opportunit(?:y|ies)\b/.test(n)) return CANON.equityThematicIndiaOpportunities;

  if (
    /\bconsumption\b/.test(n) ||
    /\bconsumer\s+opportunit(?:y|ies)\b/.test(n) ||
    /\bconsumer\s+trends\b/.test(n) ||
    /\bindia\s+consumer\b/.test(n) ||
    /\bgreat\s+consumer\b/.test(n)
  ) {
    return CANON.equityThematicConsumption;
  }

  if (/\bfmcg\b/.test(n)) return CANON.equityThematicFMCG;

  if (/\brecently\s+listed\s+ipo\b|\blisted\s+ipo\b|\bipo\s+fund\b/.test(n)) {
    return CANON.equityThematicIPO;
  }

  if (/\bmulti\s+sector\s+rotation\b|\bsector\s+rotation\b/.test(n)) {
    return CANON.equityThematicSectorRotation;
  }

  if (/\bservices?\s+fund\b/.test(n)) return CANON.equityThematicServices;

  if (/\bdigital\s+india\b/.test(n) || /\bdigital\s+bharat\b/.test(n)) {
    return CANON.equityThematicDigitalIndia;
  }

  if (/\binnovation\b|\binnovative\s+opportunities\b/.test(n)) return CANON.equityThematicInnovation;

  if (/\besg\b/.test(n)) return CANON.equityThematicESG;
  if (/\btechnolog(?:y|ical)\b|\btech\s+opportunit(?:y|ies)\b/.test(n)) return CANON.equityThematicTechnology;
  if (/\bautomotive\b/.test(n)) return CANON.equityThematicAutomotive;
  if (/\bmnc\b/.test(n)) return CANON.equityThematicMNC;
  if (/\bcomma\b|\bcommodit/.test(n)) return CANON.equityThematicCommodities;

  if (
    /\bnatural\s+resources\b|\bresources\s*&\s*energy\b|\bresources\s+and\s+energy\b|\benergy\s+opportunit(?:y|ies)\b|\benergy\b/.test(n)
  ) {
    return CANON.equityThematicResourcesEnergy;
  }

  if (/\bpsu\b/.test(n)) return CANON.equityThematicPSU;

  if (
    /\btelecom\b/.test(n) ||
    /\btelecommunication\b/.test(n) ||
    /\b5g\b/.test(n) ||
    /\bwireless\b/.test(n)
  ) {
    return CANON.equityThematicTelecommunication;
  }

  if (/\bminimum\s+variance\b|\bmomentum\b/.test(n)) return CANON.equityThematicFactorSmartBeta;
  if (/\bquant\b/.test(n)) return CANON.equityThematicQuant;

  if (/\bethical\b/.test(n)) return CANON.equityThematicEthical;
  if (/\bmanufacture\s+in\s+india\b|\bmake\s+in\s+india\b|\bmanufacturing\b/.test(n)) {
    return CANON.equityThematicManufacturing;
  }

  if (/\bmaster\s+equity\s+plan\b/.test(n)) return CANON.equityThematicDiversified;

  return null;
}

/** Keyword inference when section/category column is missing (e.g. "Liquid Fund"). */
export function inferCategoryFromFundName(schemeName: string): string | null {
  const n = schemeName.toLowerCase();

  if (/\bliquid\b|\bovernight\b/.test(n)) return CANON.debtLiquid;
  if (/\bultra\s*short\b/.test(n)) return CANON.debtUltra;
  if (/\bshort\s*duration\b|\blow\s*duration\b/.test(n)) return CANON.debtShort;
  if (/\bmoney\s*market\b/.test(n)) return CANON.debtMoney;
  if (/\bgilt\b|\blong\s*duration\b/.test(n)) return CANON.debtLong;

  if (
    /\blarge\s*&\s*mid\s*cap\b/.test(n) ||
    /\blarge\s+and\s+mid\s*cap\b/.test(n) ||
    /\blarge\s*\/\s*mid\s*cap\b/.test(n)
  ) {
    return CANON.equityLargeMid;
  }
  if (/\blarge\s*cap\b/.test(n)) return CANON.equityLarge;
  if (/\bmid\s*cap\b/.test(n)) return CANON.equityMid;
  if (/\bsmall\s*cap\b/.test(n)) return CANON.equitySmall;
  if (/\bflexi\s*cap\b/.test(n)) return CANON.equityFlexi;
  if (/\bmulti[\s-]*factor\b/.test(n)) return CANON.equityThematicMultiFactor;
  if (/\bmulti\s*cap\b/.test(n)) return CANON.equityMulti;
  if (/\bquality\s+fund\b|\bquality\s+equity\b|\bequity\s+quality\b/.test(n)) return CANON.equityQuality;
  if (/\bvalue\b/.test(n) && /\bfund\b/.test(n)) return CANON.equityValue;
  if (/\belss\b|tax\s*sav/.test(n)) return CANON.equityELSS;
  if (/\bdividend\s*yield\b/.test(n)) return CANON.equityDividendYield;
  if (/\bindex\b|\betf\b|\bnifty\b|\bsensex\b/.test(n)) return CANON.equityIndex;

  if (/\baggressive\b|\bdynamic\b/.test(n) && /hybrid|allocation/.test(n)) return CANON.hybridAgg;
  if (/\bhybrid\b|\bbalanced\b|\ballocation\b/.test(n)) return CANON.hybridBal;
  if (/\bconservative\b/.test(n) && /hybrid|debt/.test(n)) return CANON.hybridCons;

  if (/\bsolution\b|\bretirement\b|\bchildren\b/.test(n)) return CANON.solution;

  return inferThematicEquityCategoryFromFundName(schemeName);
}

/**
 * Final category for grouping: section/header vs scheme name, then a stable bucket.
 * When the sheet gives a concrete section (e.g. Value, Index, Large Cap), a **thematic** match on the
 * scheme name (e.g. “Sector Rotation”, “Conglomerate”) still wins — CRISIL-style blocks often mis-group.
 * Unclassified / Other / Equity: Other are refined from the name via {@link inferCategoryFromFundName}.
 * Never uses the source filename.
 */
export function resolveCanonicalCategory(sectionOrColumn: string | null | undefined, schemeName: string): string {
  const hint = sectionOrColumn?.trim();
  let fromHint: string | null = null;

  if (hint && hint.length > 0) {
    const fromSection = normalizeSectionHeader(hint);
    if (fromSection) {
      fromHint = fromSection;
    } else if (!/^unspecified$/i.test(hint) && hint.length > 1) {
      const title = hint
        .split(/[:/]/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(": ");
      if (title.length > 2) fromHint = title;
    }
  }

  if (fromHint && !isRefinableGenericCategory(fromHint)) {
    // Explicit, concrete section header — trust it completely; do NOT let
    // name-based thematic inference override a known category like "Large Cap".
    return fromHint;
  }

  if (fromHint && isRefinableGenericCategory(fromHint)) {
    // Generic section header (e.g. "Equity", "Thematic") — allow thematic
    // inference to refine it to a specific sub-category.
    const thematic = inferThematicEquityCategoryFromFundName(schemeName);
    if (thematic) return thematic;
    return fromHint;
  }

  const fromName = inferCategoryFromFundName(schemeName);
  if (fromName) return fromName;

  return fromHint ?? CANON.unclassified;
}
