import { describe, expect, it } from 'vitest';
import {
  buildCadArtifactFilename,
  formatLocal,
  normalizeTimestamp,
} from './workflow-card-shared';

describe('generation history timestamps', () => {
  it('preserves compact UTC offsets instead of appending a second timezone', () => {
    const compact = '2026-08-18T14:05:00+0500';
    const colonized = '2026-08-18T14:05:00+05:00';

    expect(normalizeTimestamp(compact)).toBe(compact);
    expect(formatLocal(compact)).toBe(formatLocal(colonized));
  });

  it('treats timezone-free backend timestamps as UTC', () => {
    expect(normalizeTimestamp('2026-08-18T09:05:00')).toBe('2026-08-18T09:05:00Z');
  });
});

describe('CAD artifact filenames', () => {
  it('uses the displayed rename for both artifact types', () => {
    expect(buildCadArtifactFilename('Customer Ring', 'backend.glb', 'glb')).toBe('Customer Ring.glb');
    expect(buildCadArtifactFilename('Customer Ring', 'backend.glb', '3dm')).toBe('Customer Ring.3dm');
  });

  it('does not duplicate or leak the wrong artifact extension', () => {
    expect(buildCadArtifactFilename('Customer Ring.glb', 'backend.glb', 'glb')).toBe('Customer Ring.glb');
    expect(buildCadArtifactFilename('Customer Ring.glb', 'backend.glb', '3dm')).toBe('Customer Ring.3dm');
  });

  it('sanitizes unsafe filename characters without changing the requested extension', () => {
    expect(buildCadArtifactFilename('Ring: final?', 'backend.glb', 'glb')).toBe('Ring_ final_.glb');
  });
});
