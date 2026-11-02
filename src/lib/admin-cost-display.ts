/**
 * admin-cost-display.ts
 *
 * The two cost numbers on the admin Generations pages, in credits:
 *   - User paid     = workflow.actual_cost: what the user was charged. A workflow-level
 *                     fixed price overwrites it at settlement.
 *   - Workflow cost = workflow.total_provider_cost: OUR internal credit price list summed
 *                     over every tool attempt, failed retries included (users are only
 *                     charged on success). Not real money.
 *
 * The rules keep the cells honest: 0/0 is "Free", a fixed-price workflow (see costView) reads
 * "Fixed price" (never a bare 0), and a workflow cost above what was paid shows the gap.
 * Pure functions only.
 */

export const USER_PAID_HELP = 'Credits the user was charged for this run (users are charged only when a run succeeds).';
export const WORKFLOW_COST_HELP = 'Internal credit cost of every tool call, including failed attempts that were retried. Not real money. '
  + 'A flat-price workflow whose tools have no per-call cost shows "Fixed price" instead.';
/** The list cell for a fixed-price run, and the sentence its (i) and the detail page carry. */
export const FIXED_PRICE_CELL = 'Fixed price · tool costs not recorded';
export const FIXED_PRICE_HELP = "This workflow charges a flat price. Its tools have no per-call cost set, so what it cost us isn't tracked.";
/** The (i) adds that the label is inferred, since the API sends no pricing policy. */
export const FIXED_PRICE_TIP = `${FIXED_PRICE_HELP} (Inferred: the user was charged but no tool call recorded a cost.)`;

export function formatCredits(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '-';
  const n = new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 }).format(value);
  return `${n} ${value === 1 ? 'credit' : 'credits'}`;
}

export interface CostView {
  userPaid: string;
  workflowCost: string;
  /** Workflow cost minus user paid, when the workflow cost is higher; else null. */
  overBy: number | null;
  /** Detail page only: why the workflow cost is higher, from what the steps show. */
  note: string | null;
  /** The flat price in credits when the run is a fixed-price workflow (inferred), else null. */
  fixedPrice: number | null;
}

const isNum = (v: number | null): v is number => typeof v === 'number' && !Number.isNaN(v);

/**
 * failedSteps is passed by the detail page (count of steps whose output shows an error);
 * the list has no steps, so it gets the difference alone.
 */
export function costView(
  userPaid: number | null,
  workflowCost: number | null,
  options: { failedSteps?: number } = {},
): CostView {
  if (userPaid === 0 && workflowCost === 0) {
    return { userPaid: 'Free', workflowCost: 'Free', overBy: null, note: null, fixedPrice: null };
  }
  const paidText = formatCredits(userPaid);
  // INFERRED fixed price: the user was charged but no tool call carried a cost, which is what a
  // workflow-level fixed price with 0-priced tools looks like (e.g. design_image_v1 14/0). The
  // admin API sends no policy_snapshot / pricing field to say so outright (admin-generations-api.ts
  // types, docs/admin-backend-handoff-2026-11-02.md); prefer such a field if one is ever added.
  if (workflowCost === 0 && isNum(userPaid) && userPaid > 0) {
    return { userPaid: paidText, workflowCost: FIXED_PRICE_CELL, overBy: null, note: null, fixedPrice: userPaid };
  }
  const overBy = isNum(userPaid) && isNum(workflowCost) && workflowCost > userPaid ? workflowCost - userPaid : null;
  let note: string | null = null;
  if (overBy !== null && options.failedSteps !== undefined) {
    note = options.failedSteps > 0 ? 'incl. failed retries' : 'more than the user paid';
  }
  return { userPaid: paidText, workflowCost: formatCredits(workflowCost), overBy, note, fixedPrice: null };
}
