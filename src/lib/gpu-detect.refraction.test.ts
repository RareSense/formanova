import { afterEach, describe, expect, it, vi } from "vitest";

// Each test gets a fresh module, since the support answer is cached.
async function support() {
  vi.resetModules();
  const mod = await import("./gpu-detect");
  return mod;
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("getRefractionSupport", () => {
  it("turns real gems off after an earlier crash in this browser", async () => {
    const mod = await support();
    mod.recordRefractionCrash();
    const r = mod.getRefractionSupport();
    expect(r.safe).toBe(false);
    expect(r.reason).toMatch(/stopped your browser before/);
  });

  it("turns real gems off without WebGL 2", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const mod = await support();
    const r = mod.getRefractionSupport();
    expect(r.safe).toBe(false);
    expect(r.reason).toMatch(/older/);
  });

  it("clearing the crash flag removes it", async () => {
    const mod = await support();
    mod.recordRefractionCrash();
    mod.clearRefractionCrash();
    expect(localStorage.getItem("fn_refraction_crashed")).toBeNull();
  });
});
