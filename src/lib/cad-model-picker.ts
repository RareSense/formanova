/**
 * Model x provider table behind the admin-only CAD model picker.
 *
 * Each pair names one toolkit tier (FormaNova_cad_toolkit_v2,
 * nova3d_code_generation), which carries its own token ceiling and reasoning
 * setting. The picker only chooses which tier a run sends; customers never see
 * it and always get RING_CAD_DEFAULT_TIER. What a tier costs is backend's to
 * price, per llm_tier.
 */

import { RING_CAD_TIERS, type RingCadTier } from '@/lib/ring-cad-nurbs-api';

export type CadPickerProviderId = 'direct' | 'openrouter';

export interface CadPickerModel {
  id: string;
  label: string;
  tiers: Record<CadPickerProviderId, RingCadTier>;
}

export const CAD_PICKER_MODELS: readonly CadPickerModel[] = [
  {
    id: 'opus_5_5',
    label: 'Opus 5.5',
    tiers: { direct: RING_CAD_TIERS.CLAUDE_OPUS_5_5_ANTHROPIC, openrouter: RING_CAD_TIERS.CLAUDE_OPUS_5_5_OPENROUTER },
  },
  {
    id: 'gpt_6_astra',
    label: 'GPT-6 Astra',
    tiers: { direct: RING_CAD_TIERS.GPT_6_ASTRA_OPENAI, openrouter: RING_CAD_TIERS.GPT_6_ASTRA },
  },
  {
    id: 'qwen_3_8_max',
    label: 'Qwen 3.8 Max',
    tiers: { direct: RING_CAD_TIERS.QWEN_3_8_MAX_QWEN, openrouter: RING_CAD_TIERS.QWEN_3_8_MAX_OPENROUTER },
  },
  {
    id: 'gemini_3_8_flash',
    label: 'Gemini 3.8 Flash',
    tiers: { direct: RING_CAD_TIERS.GEMINI_3_8_FLASH_GOOGLE, openrouter: RING_CAD_TIERS.GEMINI_3_8_FLASH_OPENROUTER },
  },
  {
    id: 'gemini_3_1_pro',
    label: 'Gemini 3.1 Pro',
    tiers: { direct: RING_CAD_TIERS.GEMINI_3_1_PRO_GOOGLE, openrouter: RING_CAD_TIERS.GEMINI_3_1_PRO },
  },
];

export const CAD_PICKER_PROVIDERS: readonly { id: CadPickerProviderId; label: string }[] = [
  { id: 'direct', label: 'Direct' },
  { id: 'openrouter', label: 'OpenRouter' },
];

export interface CadModelPick {
  model: string;
  provider: CadPickerProviderId;
}

/** GPT-6 Astra direct: the same tier customers get (RING_CAD_DEFAULT_TIER). */
export const DEFAULT_CAD_PICK: CadModelPick = { model: 'gpt_6_astra', provider: 'direct' };

export function cadPickerTier(model: string, provider: CadPickerProviderId): RingCadTier {
  const entry = CAD_PICKER_MODELS.find((m) => m.id === model);
  if (!entry) throw new Error(`Unknown CAD picker model: ${model}`);
  return entry.tiers[provider];
}
