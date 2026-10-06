import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RING_CAD_DEFAULT_TIER, RING_CAD_TIERS } from "@/lib/ring-cad-nurbs-api";

const admin = vi.hoisted(() => ({ value: false }));
vi.mock("@/hooks/useIsAdmin", () => ({ useIsAdmin: () => admin.value }));

import { useCadModelChoice } from "./useCadModelChoice";

describe("useCadModelChoice", () => {
  beforeEach(() => { admin.value = false; });

  it("customers always get the default tier, whatever was picked", () => {
    const { result } = renderHook(() => useCadModelChoice(RING_CAD_DEFAULT_TIER));
    act(() => result.current.setTier(RING_CAD_TIERS.CLAUDE_FABLE_5_1_SUBSCRIPTION));
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.tier).toBe(RING_CAD_DEFAULT_TIER);
  });

  it("admins run the tier they pick", () => {
    admin.value = true;
    const { result } = renderHook(() => useCadModelChoice(RING_CAD_DEFAULT_TIER));
    expect(result.current.tier).toBe(RING_CAD_DEFAULT_TIER);
    act(() => result.current.setTier(RING_CAD_TIERS.CLAUDE_FABLE_5_1_SUBSCRIPTION));
    expect(result.current.tier).toBe(RING_CAD_TIERS.CLAUDE_FABLE_5_1_SUBSCRIPTION);
  });
});
