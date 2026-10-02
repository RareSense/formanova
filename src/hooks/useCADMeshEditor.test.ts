import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { CADCanvasHandle } from "@/components/text-to-cad/CADCanvas";
import { useCADMeshEditor } from "./useCADMeshEditor";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

const PAVE = ["Pave_Gem_00", "Pave_Gem_01", "Pave_Gem_02"];
const PRONGS = ["Prong_Claw_0_1", "Prong_Claw_0_2"];
const ALL = [...PAVE, ...PRONGS, "Shank_Base_mesh"];

function setup(names: string[] = ALL) {
  const applyMaterial = vi.fn();
  const canvasRef = {
    current: { applyMaterial, getSnapshot: () => null, getSelectedTransform: () => null } as unknown as CADCanvasHandle,
  };
  const hook = renderHook(() =>
    useCADMeshEditor({ canvasRef, transformMode: "orbit", setTransformMode: vi.fn() }),
  );
  act(() => {
    hook.result.current.handleMeshesDetected(names.map((name) => ({ name, verts: 10, faces: 20 })));
  });
  return { ...hook, applyMaterial };
}

describe("useCADMeshEditor families", () => {
  beforeEach(() => vi.clearAllMocks());

  it("selects the whole family of the clicked part", () => {
    const { result } = setup();
    act(() => result.current.handleSelectFamily("Pave_Gem_01", false));
    expect([...result.current.selectedNames].sort()).toEqual(PAVE);
  });

  it("replaces the selection when selecting another family", () => {
    const { result } = setup();
    act(() => result.current.handleSelectFamily("Pave_Gem_01", false));
    act(() => result.current.handleSelectFamily("Prong_Claw_0_1", false));
    expect([...result.current.selectedNames].sort()).toEqual(PRONGS);
  });

  it("toggles a family in multi mode", () => {
    const { result } = setup();
    act(() => result.current.handleSelectFamily("Prong_Claw_0_1", false));
    act(() => result.current.handleSelectFamily("Pave_Gem_00", true));
    expect(result.current.selectedNames).toHaveLength(5);
    act(() => result.current.handleSelectFamily("Pave_Gem_00", true));
    expect([...result.current.selectedNames].sort()).toEqual(PRONGS);
  });

  it("clears the selection for an empty name", () => {
    const { result } = setup();
    act(() => result.current.handleSelectFamily("Pave_Gem_01", false));
    act(() => result.current.handleSelectFamily("", false));
    expect(result.current.selectedNames).toEqual([]);
  });

  it("keeps single-part selection unchanged", () => {
    const { result } = setup();
    act(() => result.current.handleSelectFamily("Pave_Gem_01", false));
    act(() => result.current.handleSelectMesh("Pave_Gem_02", false));
    expect(result.current.selectedNames).toEqual(["Pave_Gem_02"]);
  });

  it("tracks the hovered family", () => {
    const { result } = setup();
    act(() => result.current.setHoveredPart("Prong_Claw_0_2"));
    expect([...result.current.hoveredFamilyNames].sort()).toEqual(PRONGS);
    act(() => result.current.setHoveredPart(null));
    expect(result.current.hoveredFamilyNames.size).toBe(0);
  });

  it("applies a gem material to every stone", () => {
    const { result, applyMaterial } = setup();
    act(() => result.current.handleApplyGemToAll("diamond"));
    expect(applyMaterial).toHaveBeenCalledTimes(1);
    expect(applyMaterial).toHaveBeenCalledWith("diamond", PAVE);
  });

  it("does nothing when there are no stones", () => {
    const { result, applyMaterial } = setup(["Shank_Base_mesh"]);
    act(() => result.current.handleApplyGemToAll("diamond"));
    expect(applyMaterial).not.toHaveBeenCalled();
    expect(result.current.selectionWarning).toBe("No stones to update");
  });
});
