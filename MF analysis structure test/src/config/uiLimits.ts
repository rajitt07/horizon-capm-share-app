/** Hard cap on how many funds can be in comparison selection (Select All, chips, table). */
export const MAX_SELECTABLE_FUNDS = 200;

/**
 * In "Prev vs Latest" (both) mode the table renders two columns per fund.
 * Cap at half to keep the total column count ≤ MAX_SELECTABLE_FUNDS and avoid
 * browser freeze at full selection.
 */
export const MAX_SELECTABLE_FUNDS_BOTH_MODE = 100;
