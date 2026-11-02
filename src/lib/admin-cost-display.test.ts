import { describe, expect, it } from 'vitest';

import {
  costView, FIXED_PRICE_CELL, FIXED_PRICE_HELP, FIXED_PRICE_TIP, formatCredits, USER_PAID_HELP, WORKFLOW_COST_HELP,
} from './admin-cost-display';

describe('formatCredits', () => {
  it('shows a dash when the value is missing', () => {
    expect(formatCredits(null)).toBe('-');
    expect(formatCredits(Number.NaN)).toBe('-');
  });

  it('shows whole and fractional credits', () => {
    expect(formatCredits(14)).toBe('14 credits');
    expect(formatCredits(1)).toBe('1 credit');
    expect(formatCredits(2.5)).toBe('2.5 credits');
  });
});

describe('costView', () => {
  it('design_image_v1 14/0: a fixed-price workflow, never a bare 0 or "not priced"', () => {
    expect(costView(14, 0)).toEqual({
      userPaid: '14 credits', workflowCost: 'Fixed price · tool costs not recorded', overBy: null, note: null, fixedPrice: 14,
    });
    expect(FIXED_PRICE_CELL).toBe('Fixed price · tool costs not recorded');
    expect(FIXED_PRICE_HELP).toBe("This workflow charges a flat price. Its tools have no per-call cost set, so what it cost us isn't tracked.");
    expect(FIXED_PRICE_TIP).toMatch(/^This workflow charges a flat price\..*Inferred/);
  });

  it('photoshoot 20/28 in the list: shows the amber difference only', () => {
    expect(costView(20, 28)).toEqual({ userPaid: '20 credits', workflowCost: '28 credits', overBy: 8, note: null, fixedPrice: null });
  });

  it('photoshoot 20/28 in the detail with a failed step: says it includes failed retries', () => {
    expect(costView(20, 28, { failedSteps: 1 }).note).toBe('incl. failed retries');
  });

  it('detail with no failed step found: does not claim a retry', () => {
    expect(costView(20, 28, { failedSteps: 0 }).note).toBe('more than the user paid');
  });

  it('cad_to_catalog_fastload 0/0 reads "Free" on both sides', () => {
    expect(costView(0, 0)).toEqual({ userPaid: 'Free', workflowCost: 'Free', overBy: null, note: null, fixedPrice: null });
  });

  it('plain case: workflow cost at or under what was paid', () => {
    expect(costView(24, 24)).toEqual({ userPaid: '24 credits', workflowCost: '24 credits', overBy: null, note: null, fixedPrice: null });
    expect(costView(40, 28)).toEqual({ userPaid: '40 credits', workflowCost: '28 credits', overBy: null, note: null, fixedPrice: null });
  });

  it('a failed run that charged nothing but cost us credits shows the gap', () => {
    expect(costView(0, 8)).toEqual({ userPaid: '0 credits', workflowCost: '8 credits', overBy: 8, note: null, fixedPrice: null });
  });

  it('missing numbers stay dashes and never make a gap', () => {
    expect(costView(null, null)).toEqual({ userPaid: '-', workflowCost: '-', overBy: null, note: null, fixedPrice: null });
    expect(costView(null, 8)).toEqual({ userPaid: '-', workflowCost: '8 credits', overBy: null, note: null, fixedPrice: null });
    expect(costView(14, null)).toEqual({ userPaid: '14 credits', workflowCost: '-', overBy: null, note: null, fixedPrice: null });
  });

  it('has one plain sentence for each header', () => {
    expect(USER_PAID_HELP).toMatch(/charged/);
    expect(WORKFLOW_COST_HELP).toBe('Internal credit cost of every tool call, including failed attempts that were retried. Not real money. '
      + 'A flat-price workflow whose tools have no per-call cost shows "Fixed price" instead.');
  });
});
