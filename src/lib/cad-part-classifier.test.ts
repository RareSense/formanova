import { describe, expect, it } from "vitest";
import { classifyCadPartName, isCadGemName } from "./cad-part-classifier";
// Part names from 40 generated GLBs, labelled by geometry: every runtime-placed
// stone shares one faceted vertex signature. Stones in other cuts (pear, oval,
// rose) were labelled from their names.
import fixture from "./cad-part-classifier.fixture.json";

describe("classifyCadPartName", () => {
  it.each(fixture.gem)("%s is a gem", (name) => {
    expect(classifyCadPartName(name)).toBe("gem");
  });

  it.each(fixture.metal)("%s is metal", (name) => {
    expect(classifyCadPartName(name) ?? "metal").toBe("metal");
  });

  it("holders named after the stone they hold are metal", () => {
    for (const name of ["halo_shared_bead_3_inner", "HaloBead.outer.4.in", "pave_L_1_cup",
      "shankA_pave_l2_seat", "accent_seat_left", "halo_basket_wall", "Top_BezelBead_01"]) {
      expect(classifyCadPartName(name)).toBe("metal");
    }
  });

  it("accent and pave stones are gems", () => {
    for (const name of ["accent_l_2", "Accent_R", "ShoulderAccent.L", "GalleryCenterAccent",
      "shoulder_pave_left_4", "PaveGem_3"]) {
      expect(isCadGemName(name)).toBe(true);
    }
  });

  it("does not read 'engagement' as a gem", () => {
    expect(classifyCadPartName("EngagementBand")).toBe("metal");
    expect(classifyCadPartName("shank_engagement")).toBe("metal");
  });

  it("returns null for names without a known word so callers keep their fallbacks", () => {
    expect(classifyCadPartName("Mesh")).toBeNull();
    expect(classifyCadPartName("")).toBeNull();
  });
});
