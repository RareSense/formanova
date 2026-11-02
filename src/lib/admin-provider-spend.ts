/**
 * admin-provider-spend.ts
 *
 * Real money a run's tools REPORTED spending with their providers (mainly the CAD llm
 * steps). Only what a step's output states is read; nothing is estimated:
 *   - cost.total_usd   (formanova_cad_llm_caller; null when the provider did not report it)
 *   - cost_usd         (CAD steps that make their own model calls)
 * read at the top level of the output or under its { result } wrapper only, one number per
 * step, so a step's sub-costs (coding_cost_usd, ...) are never added twice.
 * A step that reports token usage but no USD is listed with usd: null.
 */
import type { AdminGenerationStep } from '@/lib/admin-generations-api';
import { asRecord, unwrapResult } from '@/lib/admin-workflow-views/common';

export interface StepSpend {
  index: number;
  tool: string;
  usd: number | null;
  tokens: number | null;
}

export interface ProviderSpend {
  /** Sum of the reported USD; null when no step reported any. */
  totalUsd: number | null;
  steps: StepSpend[];
}

const money = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

function readStep(output: unknown): { usd: number | null; tokens: number | null; reported: boolean } {
  for (const node of [asRecord(output) ?? {}, unwrapResult(output)]) {
    const cost = asRecord(node.cost);
    const usage = asRecord(node.usage);
    const usd = money(cost?.total_usd) ?? money(node.cost_usd);
    const tokens = count(cost?.total_tokens) ?? count(usage?.total_tokens);
    if (usd !== null || cost || usage) return { usd, tokens, reported: usd !== null || tokens !== null };
  }
  return { usd: null, tokens: null, reported: false };
}

export function readProviderSpend(steps: AdminGenerationStep[]): ProviderSpend {
  const out: StepSpend[] = [];
  steps.forEach((step, i) => {
    const { usd, tokens, reported } = readStep(step.output);
    if (reported) out.push({ index: i + 1, tool: step.tool_name, usd, tokens });
  });
  const priced = out.filter((s) => s.usd !== null);
  return {
    totalUsd: priced.length ? priced.reduce((sum, s) => sum + (s.usd as number), 0) : null,
    steps: out,
  };
}

export function formatUsd(value: number): string {
  return value > 0 && value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
}
