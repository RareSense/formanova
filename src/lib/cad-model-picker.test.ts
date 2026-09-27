import { describe, expect, it } from 'vitest';

import {
  CAD_PICKER_MODELS,
  CAD_PICKER_PROVIDERS,
  DEFAULT_CAD_PICK,
  cadPickerTier,
} from '@/lib/cad-model-picker';
import { RING_CAD_DEFAULT_TIER } from '@/lib/ring-cad-nurbs-api';

describe('CAD model picker tiers', () => {
  it('maps every model and provider to the toolkit tier of that exact route', () => {
    // Tier ids must match FormaNova_cad_toolkit_v2 nova3d_code_generation tiers.
    expect(
      Object.fromEntries(
        CAD_PICKER_MODELS.flatMap((m) =>
          CAD_PICKER_PROVIDERS.map((p) => [`${m.id}/${p.id}`, cadPickerTier(m.id, p.id)]),
        ),
      ),
    ).toEqual({
      'opus_5_5/direct': 'claude_opus_5_5_anthropic',
      'opus_5_5/openrouter': 'claude_opus_5_5_openrouter',
      'gpt_6_astra/direct': 'gpt_6_astra_openai',
      'gpt_6_astra/openrouter': 'gpt_6_astra_openrouter',
      'qwen_3_8_max/direct': 'qwen_3_8_max_qwen',
      'qwen_3_8_max/openrouter': 'qwen_3_8_max_openrouter',
      'gemini_3_8_flash/direct': 'gemini_3_8_flash_google',
      'gemini_3_8_flash/openrouter': 'gemini_3_8_flash_openrouter',
    });
  });

  it('starts on the same tier customers get, so opening the picker changes nothing', () => {
    expect(cadPickerTier(DEFAULT_CAD_PICK.model, DEFAULT_CAD_PICK.provider)).toBe(RING_CAD_DEFAULT_TIER);
  });

  it('labels the buttons with the model names the team uses', () => {
    expect(CAD_PICKER_MODELS.map((m) => m.label)).toEqual([
      'Opus 5.5',
      'GPT-6 Astra',
      'Qwen 3.8 Max',
      'Gemini 3.8 Flash',
    ]);
    expect(CAD_PICKER_PROVIDERS.map((p) => p.label)).toEqual(['Direct', 'OpenRouter']);
  });
});
