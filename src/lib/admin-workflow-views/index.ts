/**
 * The admin detail page's view of one run, for ANY workflow: Inputs (the request payload),
 * a Steps timeline (every tool call's input and output) and Outputs (the last successful
 * step's output). Everything is walked schema-free (walker.ts); the family only adds labels
 * and order (families.ts). A new workflow needs no code here to be shown in full.
 */
import type { AdminGenerationDetail } from '@/lib/admin-generations-api';
import { stepFailure } from './common';
import { ENHANCEMENTS, workflowFamily, type WorkflowFamily } from './families';
import { walk, type Enhancement, type ViewNode } from './walker';

export type { WorkflowFamily } from './families';
export { workflowFamily } from './families';
export type { ViewNode, MediaKind, Enhancement } from './walker';

export interface StepView {
  /** 1-based position among all recorded tool calls. */
  index: number;
  tool: string;
  tookMs: number | null;
  at: string | null;
  /** Inferred from the output (common.ts stepFailure); the API sends no is_success. */
  failed: boolean;
  /** A later call of the same tool exists, so this failure was retried (inferred). */
  retried: boolean;
  error: string | null;
  input: ViewNode;
  output: ViewNode;
  /** The recorded JSON, for the collapsible raw view. */
  raw: { input: unknown; output: unknown };
}

export interface RunView {
  family: WorkflowFamily;
  /** The family's labels and order, passed on to the renderer for on-demand deeper levels. */
  enh: Enhancement;
  inputs: ViewNode;
  steps: StepView[];
  /** The last successful step's output; intermediates stay in the timeline. */
  outputs: { stepIndex: number; tool: string; node: ViewNode } | null;
}

export function buildRunView(detail: AdminGenerationDetail, isCadModel: boolean): RunView {
  const family = workflowFamily(detail.workflow_name, isCadModel);
  const enh = ENHANCEMENTS[family];
  const steps: StepView[] = detail.steps.map((step, i) => {
    const { failed, error } = stepFailure(step.output);
    return {
      index: i + 1,
      tool: step.tool_name,
      tookMs: step.took_ms,
      at: step.at,
      failed,
      retried: failed && detail.steps.slice(i + 1).some((later) => later.tool_name === step.tool_name),
      error,
      input: walk(step.input, `steps[${i}].input`, enh, step.tool_name),
      output: walk(step.output, `steps[${i}].output`, enh, step.tool_name),
      raw: { input: step.input, output: step.output },
    };
  });
  const last = [...steps].reverse().find((s) => !s.failed) ?? null;
  return {
    family,
    enh,
    inputs: walk(detail.input_payload, 'input_payload', enh),
    steps,
    outputs: last ? { stepIndex: last.index, tool: last.tool, node: last.output } : null,
  };
}
