import { RING_CAD_TIERS, type RingCadTier } from "./ring-cad-nurbs-api";

/** How a tier's model is paid for: a provider API key, OpenRouter, or a connected subscription. */
export type CadModelRoute = "direct" | "openrouter" | "subscription";

/** The model behind each tier. A Record, so a new tier fails to compile until it has a name. */
const MODEL_NAMES: Record<RingCadTier, string> = {
  claude_fable_5_openrouter: "Claude Fable 5",
  claude_fable_5_1_anthropic: "Claude Fable 5.1",
  claude_fable_5_1_openrouter: "Claude Fable 5.1",
  claude_opus_5_openrouter: "Claude Opus 5",
  gpt_5_6_sol_openrouter: "GPT-5.6 Sol",
  gemini_3_1_pro_openrouter: "Gemini 3.1 Pro",
  gemini_3_1_pro_google: "Gemini 3.1 Pro",
  gpt_5_6_luna_openrouter: "GPT-5.6 Luna",
  gpt_6_astra_openrouter: "GPT-6 Astra",
  gpt_6_astra_openai: "GPT-6 Astra",
  gpt_6_astra_pro_openrouter: "GPT-6 Astra Pro",
  claude_opus_5_5_anthropic: "Claude Opus 5.5",
  claude_opus_5_5_openrouter: "Claude Opus 5.5",
  qwen_3_8_max_qwen: "Qwen 3.8 Max",
  qwen_3_8_max_openrouter: "Qwen 3.8 Max",
  gemini_3_8_flash_google: "Gemini 3.8 Flash",
  gemini_3_8_flash_openrouter: "Gemini 3.8 Flash",
  gemini_4_argon_google: "Gemini 4 Argon",
  gemini_4_argon_openrouter: "Gemini 4 Argon",
  claude_fable_5_1_subscription: "Claude Fable 5.1",
  claude_opus_5_5_subscription: "Claude Opus 5.5",
  gpt_6_astra_chatgpt_subscription: "GPT-6 Astra",
  gpt_5_6_sol_chatgpt_subscription: "GPT-5.6 Sol",
};

export function cadModelRoute(tier: RingCadTier): CadModelRoute {
  if (tier.endsWith("_subscription")) return "subscription";
  if (tier.endsWith("_openrouter")) return "openrouter";
  return "direct";
}

export interface CadModelOption {
  tier: RingCadTier;
  name: string;
}

export interface CadModelGroup {
  route: CadModelRoute;
  label: string;
  options: CadModelOption[];
}

const GROUP_LABELS: Record<CadModelRoute, string> = {
  direct: "Direct API",
  openrouter: "OpenRouter",
  subscription: "Subscription",
};

/** Every tier, grouped Direct API, then OpenRouter, then Subscription. */
export const CAD_MODEL_GROUPS: CadModelGroup[] = (["direct", "openrouter", "subscription"] as const).map((route) => ({
  route,
  label: GROUP_LABELS[route],
  options: Object.values(RING_CAD_TIERS)
    .filter((tier) => cadModelRoute(tier) === route)
    .map((tier) => ({ tier, name: MODEL_NAMES[tier] })),
}));

/** "GPT-6 Astra · Direct API" — what the closed picker shows. */
export function cadModelLabel(tier: RingCadTier): string {
  return `${MODEL_NAMES[tier]} · ${GROUP_LABELS[cadModelRoute(tier)]}`;
}
