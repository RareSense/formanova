import { describe, expect, it } from 'vitest';

import { formatUsd, readProviderSpend } from './admin-provider-spend';
import type { AdminGenerationStep } from '@/lib/admin-generations-api';

const step = (tool_name: string, output: unknown): AdminGenerationStep => ({ tool_name, took_ms: null, at: null, input: {}, output });

describe('readProviderSpend', () => {
  it('sums the USD a CAD run reported per step (llm_caller cost.total_usd and cost_usd)', () => {
    const spend = readProviderSpend([
      step('formanova_cad_prompt_builder', { result: { prompt: 'x' } }),
      step('formanova_cad_llm_caller', { result: { ok: true, cost: { total_usd: 0.4123, total_tokens: 18000, is_exact: true }, usage: { input_tokens: 1 } } }),
      step('formanova_cad_ring_select_candidate_and_batch', { cost_usd: 1.25, coding_cost_usd: 1.0, annotation_cost_usd: 0.25 }),
    ]);
    expect(spend.totalUsd).toBeCloseTo(1.6623, 6);
    expect(spend.steps).toEqual([
      { index: 2, tool: 'formanova_cad_llm_caller', usd: 0.4123, tokens: 18000 },
      { index: 3, tool: 'formanova_cad_ring_select_candidate_and_batch', usd: 1.25, tokens: null },
    ]);
  });

  it('lists a step that reported usage but no USD, without pricing it', () => {
    const spend = readProviderSpend([
      step('formanova_cad_llm_caller', { result: { cost: { total_usd: null, total_tokens: 900, source: 'not_reported_by_provider' }, usage: { total_tokens: 900 } } }),
    ]);
    expect(spend.totalUsd).toBeNull();
    expect(spend.steps).toEqual([{ index: 1, tool: 'formanova_cad_llm_caller', usd: null, tokens: 900 }]);
  });

  it('reports nothing for workflows whose steps carry no cost', () => {
    const spend = readProviderSpend([
      step('analyze_jewelry_pdp', { result: { category: 'ring' } }),
      step('generate_jewelry_image_pdp_higher_tier', { output_url: 'https://x/y.png' }),
    ]);
    expect(spend).toEqual({ totalUsd: null, steps: [] });
  });

  it('ignores negative, NaN and non-number costs', () => {
    const spend = readProviderSpend([step('a', { cost_usd: -1 }), step('b', { cost_usd: 'free' }), step('c', { cost: { total_usd: Number.NaN } })]);
    expect(spend).toEqual({ totalUsd: null, steps: [] });
  });
});

describe('formatUsd', () => {
  it('keeps cents, and more digits for tiny amounts', () => {
    expect(formatUsd(1.6623)).toBe('$1.66');
    expect(formatUsd(0.0031)).toBe('$0.0031');
    expect(formatUsd(0)).toBe('$0.00');
  });
});
