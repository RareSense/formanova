import { describe, expect, it } from 'vitest';
import { NO_VOLUME_REASON, OUT_OF_RANGE_REASON, pickWeightSource, readWeightTarget, resolveMetalWeight, type SentMetal } from './source';

describe('pickWeightSource', () => {
  it('prefers the version volume, then the result volume, then mass ÷ density', () => {
    expect(pickWeightSource({ versionVolumeMm3: 2192.4, resultVolumeMm3: 1 }))
      .toEqual({ available: true, volumeMm3: 2192.4, from: 'version' });
    expect(pickWeightSource({ versionVolumeMm3: null, resultVolumeMm3: 1500 }))
      .toEqual({ available: true, volumeMm3: 1500, from: 'result' });
    const fromMass = pickWeightSource({ resultMassG: 27.975024, resultDensityGCm3: 12.76 });
    expect(fromMass.available && fromMass.from).toBe('mass');
    expect(fromMass.available && fromMass.volumeMm3).toBeCloseTo(2192.4, 9);
  });

  it('skips an invalid version volume for a valid result volume', () => {
    expect(pickWeightSource({ versionVolumeMm3: 0, resultVolumeMm3: 1500 }))
      .toEqual({ available: true, volumeMm3: 1500, from: 'result' });
  });

  it('is not available for missing, zero, negative, non-finite or string volumes', () => {
    for (const v of [undefined, null, 0, -5, NaN, Infinity, '2192.4']) {
      expect(pickWeightSource({ versionVolumeMm3: v })).toEqual({ available: false, reason: NO_VOLUME_REASON });
    }
  });

  it('is not available, saying why, for a volume no piece could weigh', () => {
    for (const v of [0.5, 1e-6, 500_000, 1e25]) {
      expect(pickWeightSource({ versionVolumeMm3: v })).toEqual({ available: false, reason: OUT_OF_RANGE_REASON });
    }
    // A plausible fallback still wins over an implausible version value.
    expect(pickWeightSource({ versionVolumeMm3: 1e25, resultVolumeMm3: 1500 }).available).toBe(true);
  });

  it('is not available for a mass without the density it was computed with', () => {
    expect(pickWeightSource({ resultMassG: 25 })).toEqual({ available: false, reason: NO_VOLUME_REASON });
    expect(pickWeightSource({ resultMassG: 0, resultDensityGCm3: 12.76 })).toEqual({ available: false, reason: NO_VOLUME_REASON });
  });
});

describe('readWeightTarget', () => {
  it('reads grams, tolerance and alloy id', () => {
    expect(readWeightTarget({ grams: 28, tolerance_pct: 3, alloy_id: 'au14y' }))
      .toEqual({ grams: 28, tolerancePct: 3, alloyId: 'au14y' });
  });

  it('defaults the tolerance to 5 and a missing alloy to null', () => {
    expect(readWeightTarget({ grams: 28 })).toEqual({ grams: 28, tolerancePct: 5, alloyId: null });
    expect(readWeightTarget({ grams: 28, tolerance_pct: Infinity, alloy_id: '' })).toEqual({ grams: 28, tolerancePct: 5, alloyId: null });
  });

  it('clamps the tolerance to 0–100', () => {
    expect(readWeightTarget({ grams: 28, tolerance_pct: -1 })?.tolerancePct).toBe(0);
    expect(readWeightTarget({ grams: 28, tolerance_pct: 1e12 })?.tolerancePct).toBe(100);
  });

  it('is null without a positive gram figure of at most 10 kg', () => {
    expect(readWeightTarget({ grams: 10_000 })?.grams).toBe(10_000);
    for (const raw of [null, undefined, 'x', {}, { grams: 0 }, { grams: '28' }, { grams: NaN }, { grams: -2 }, { grams: 10_001 }, { grams: 1e-300 }]) {
      expect(readWeightTarget(raw)).toBeNull();
    }
  });
});

describe('resolveMetalWeight', () => {
  const sent: SentMetal = {
    workflowId: 'wf-1',
    alloyId: 'au10y',
    densityGCm3: 11.24,
    target: { grams: 25, tolerancePct: 5, alloyId: 'au10y' },
  };

  it('uses the version on screen and its own target', () => {
    const resolved = resolveMetalWeight({
      shownVersion: {
        asset_id: 'v1', source_workflow_id: 'wf-1', metal_volume_mm3: 2192.4,
        weight_target: { grams: 28, tolerance_pct: 5, alloy_id: 'au14y' },
      },
      workflowId: 'wf-1', resultVolumeMm3: null, resultMassG: null, sent,
    });
    expect(resolved).toEqual({
      key: 'v1',
      source: { available: true, volumeMm3: 2192.4, from: 'version' },
      target: { grams: 28, tolerancePct: 5, alloyId: 'au14y' },
      requestedAlloyId: 'au10y',
      twoTone: false,
    });
  });

  it('falls back to this run’s mass, with the density and target it was sent with', () => {
    const resolved = resolveMetalWeight({ shownVersion: null, workflowId: 'wf-1', resultVolumeMm3: null, resultMassG: 24.642576, sent });
    expect(resolved.source.available && resolved.source.from).toBe('mass');
    expect(resolved.target).toEqual(sent.target);
    expect(resolved.key).toBe('wf-1');
  });

  it('never applies a run’s result to a version that run did not make', () => {
    const resolved = resolveMetalWeight({
      shownVersion: { asset_id: 'v0', source_workflow_id: 'wf-0' },
      workflowId: 'wf-1', resultVolumeMm3: 1500, resultMassG: 24.6, sent,
    });
    expect(resolved.source.available).toBe(false);
    expect(resolved.target).toBeNull();
    expect(resolved.requestedAlloyId).toBeNull();
  });

  it('ignores what was sent with a different run', () => {
    const resolved = resolveMetalWeight({ shownVersion: null, workflowId: 'wf-2', resultVolumeMm3: null, resultMassG: 24.6, sent });
    expect(resolved.source.available).toBe(false);
    expect(resolved.requestedAlloyId).toBeNull();
  });

  it('is not available for an old run with neither volume nor mass', () => {
    const resolved = resolveMetalWeight({ shownVersion: { asset_id: 'v1' }, workflowId: null, resultVolumeMm3: null, resultMassG: null, sent: null });
    expect(resolved).toEqual({ key: 'v1', source: { available: false, reason: NO_VOLUME_REASON }, target: null, requestedAlloyId: null, twoTone: false });
  });

  it('flags a version made of more than one metal body as two-tone', () => {
    const base = { workflowId: null, resultVolumeMm3: null, resultMassG: null, sent: null };
    expect(resolveMetalWeight({ ...base, shownVersion: { asset_id: 'v1', metal_body_count: 2 } }).twoTone).toBe(true);
    for (const count of [1, 0, -2, 1.5, '2', null, undefined]) {
      expect(resolveMetalWeight({ ...base, shownVersion: { asset_id: 'v1', metal_body_count: count } }).twoTone).toBe(false);
    }
  });
});
