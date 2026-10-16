import { describe, expect, it } from "vitest";
import { CAD_MODEL_GROUPS, cadModelLabel, cadModelRoute } from "./cad-model-options";
import { RING_CAD_TIERS } from "./ring-cad-nurbs-api";

describe("cad model options", () => {
  it("groups Direct API, then OpenRouter, then Subscription", () => {
    expect(CAD_MODEL_GROUPS.map((group) => group.label)).toEqual(["Direct API", "OpenRouter", "Subscription"]);
  });

  it("lists every tier exactly once", () => {
    const listed = CAD_MODEL_GROUPS.flatMap((group) => group.options.map((option) => option.tier));
    expect(listed.sort()).toEqual(Object.values(RING_CAD_TIERS).sort());
  });

  it("puts each tier under how it is paid for", () => {
    expect(cadModelRoute(RING_CAD_TIERS.GPT_6_ASTRA_OPENAI)).toBe("direct");
    expect(cadModelRoute(RING_CAD_TIERS.GPT_6_ASTRA)).toBe("openrouter");
    expect(cadModelRoute(RING_CAD_TIERS.CLAUDE_FABLE_5_1_SUBSCRIPTION)).toBe("subscription");
    expect(cadModelRoute(RING_CAD_TIERS.GPT_6_ASTRA_CHATGPT_SUBSCRIPTION)).toBe("subscription");
  });

  it("names the model and its route", () => {
    expect(cadModelLabel(RING_CAD_TIERS.CLAUDE_FABLE_5_1_SUBSCRIPTION)).toBe("Claude Fable 5.1 · Subscription");
    expect(cadModelLabel(RING_CAD_TIERS.GPT_6_ASTRA_OPENAI)).toBe("GPT-6 Astra · Direct API");
  });
});
