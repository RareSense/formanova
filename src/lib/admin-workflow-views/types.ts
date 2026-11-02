/**
 * What the admin detail page shows for one run: Inputs -> Steps timeline -> Outputs.
 * Each workflow family has an extractor that builds this from the detail response;
 * values are only ever read from the payload, never filled in.
 */
import type { AdminGenerationDetail } from '@/lib/admin-generations-api';

export interface ViewImage {
  url: string;
  label: string;
}

export interface ViewField {
  label: string;
  value: string;
  /** Prompts and other long text: shown as a readable block instead of a short value. */
  long?: boolean;
}

export interface ViewFile {
  label: string;
  url: string;
  name: string | null;
  bytes: number | null;
}

export interface ViewSection {
  fields: ViewField[];
  images: ViewImage[];
  files: ViewFile[];
}

export interface ViewStep {
  /** 1-based position among all recorded tool calls. */
  index: number;
  tool: string;
  tookMs: number | null;
  at: string | null;
  /** Inferred from the output (see stepFailure); the API does not send is_success. */
  failed: boolean;
  /** A later call of the same tool exists, so this failure was retried. */
  retried: boolean;
  error: string | null;
  fields: ViewField[];
  images: ViewImage[];
  input: unknown;
  output: unknown;
}

export type WorkflowFamily =
  | 'product_shot'
  | 'photoshoot'
  | 'design_image'
  | 'cad_fastload'
  | 'cad_shot'
  | 'cad_model'
  | 'generic';

export interface WorkflowView {
  family: WorkflowFamily;
  inputs: ViewSection;
  steps: ViewStep[];
  outputs: ViewSection;
}

export type WorkflowExtractor = (detail: AdminGenerationDetail) => WorkflowView;

export const emptySection = (): ViewSection => ({ fields: [], images: [], files: [] });
