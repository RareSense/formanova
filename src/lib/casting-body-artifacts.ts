/**
 * The casting body: the CAD postprocessor's `derivatives.casting_body`, one
 * STEP and one STL per metal alloy with the metal fused into a single closed
 * solid and the stones left out. It is what a caster actually needs.
 *
 * Optional by design. Older runs have no casting_body at all, and a run whose
 * fusion was skipped, failed or only partly finished must not surface a
 * half-made solid, so anything other than `completed` yields no files and the
 * download menu simply leaves the rows out.
 */

import type { ArtifactRef } from '@/lib/ring-cad-nurbs-api';

export type CastingBodyFormat = 'step' | 'stl';

export interface CastingBodyArtifact extends ArtifactRef {
  format: CastingBodyFormat;
  /** Backend file name, e.g. "casting_body_18k_yellow.step". */
  name: string;
  /** The alloy this solid is made of, when the backend says. */
  material: string | null;
}

/** The download lists the generation record and workspace carry. */
export interface CastingBodyUrls {
  castingStepUrls: string[];
  castingStlUrls: string[];
}

const SHA256_RE = /^[a-f0-9]{64}$/i;

function formatOf(name: string): CastingBodyFormat | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.step') || lower.endsWith('.stp')) return 'step';
  if (lower.endsWith('.stl')) return 'stl';
  return null;
}

/**
 * Reads a casting_body node into downloadable files.
 *
 * `readArtifact` is the result parser's own artifact reader, passed in so the
 * same url rules (signed url first, content-addressed refs collapsed to the
 * same-origin proxy) apply here without a circular import. A file with no uri
 * but a valid sha256 is content-addressed, so it is routed to that proxy too.
 */
export function parseCastingBody(
  node: unknown,
  readArtifact: (value: unknown) => ArtifactRef | null,
): CastingBodyArtifact[] {
  if (!node || typeof node !== 'object') return [];
  const body = node as Record<string, unknown>;
  if (body.status !== 'completed' || !Array.isArray(body.files)) return [];

  const artifacts: CastingBodyArtifact[] = [];
  for (const raw of body.files) {
    if (!raw || typeof raw !== 'object') continue;
    const file = raw as Record<string, unknown>;
    const name = typeof file.name === 'string' ? file.name : '';
    const format = formatOf(name);
    if (!format) continue;
    const sha = typeof file.sha256 === 'string' ? file.sha256 : '';
    const hasRef = (typeof file.uri === 'string' && file.uri) || (typeof file.url === 'string' && file.url);
    const ref = readArtifact(hasRef || !SHA256_RE.test(sha) ? file : { ...file, uri: `/api/artifacts/${sha}` });
    if (!ref) continue;
    const material = typeof file.material === 'string' ? file.material
      : typeof file.role === 'string' ? file.role : null;
    artifacts.push({ ...ref, type: ref.type || `model/${format}`, format, name, material });
  }
  return artifacts;
}

export function castingBodyUrls(artifacts: readonly CastingBodyArtifact[] | undefined): CastingBodyUrls {
  const list = artifacts ?? [];
  return {
    castingStepUrls: list.filter((a) => a.format === 'step').map((a) => a.url),
    castingStlUrls: list.filter((a) => a.format === 'stl').map((a) => a.url),
  };
}
