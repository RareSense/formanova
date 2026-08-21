/**
 * CAD result fetch — extracted from generation-history-api.ts to keep that
 * file under AI_RULES.md's file-size guideline. Same module, same
 * conventions; split purely by concern (this is a single self-contained
 * fetch/parse function with no dependency on the rest of that file).
 */
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { azureUriToUrl } from '@/lib/azure-utils';
import { parseRingCadResult } from '@/lib/ring-cad-nurbs-api';

const __DEV__ = import.meta.env.DEV;

/**
 * Fetch the final result for a CAD workflow using the /result endpoint.
 *
 * ring_cad_nurbs_v1 returns a flat object (threedm_artifact/glb_artifact at
 * the top level) — that shape is tried first via parseRingCadResult. Older
 * CAD workflows (ring_generate_v1, ring_edit_v1) return the nested
 * node_results shape below and never carry a .3dm, so threedm_url is null
 * for those. Both paths route through azureUriToUrl so every returned URL is
 * this app's same-origin, auth-gated artifact proxy rather than a raw
 * azure:// reference or an unauthenticated cross-origin host.
 *
 * Legacy sink-based fallback rule:
 *   success_final → glb_artifact (final output, preferred) → original_glb_artifact (intermediate)
 *   success_original_glb → original_glb_artifact
 *   failed_final → null (no fallback)
 */
export async function fetchCadResult(
  workflowId: string,
): Promise<{
  glb_url: string | null;
  threedm_url: string | null;
  azure_source: string | null;
  /**
   * True when the run produced parts that are not closed solids.
   *
   * An unsealed surface cannot be cast or 3D printed, so this is the single
   * most consequential thing to tell a jeweler about their file. Carried here
   * rather than dropped because the caller has no other way to reach it: the
   * diagnostic only exists inside the /result body this function consumes.
   *
   * False for legacy workflows, which never reported solidity at all. Absence
   * must read as "nothing to warn about" rather than as a warning, or every
   * old run shows an alarm nobody can act on.
   */
  not_all_solid: boolean;
}> {
  function extractArtifactUri(results: Record<string, unknown>, nodeKey: string, artifactKey: string): string | null {
    const node = results[nodeKey];
    if (!node) return null;
    const arr = Array.isArray(node) ? node : [node];
    for (const entry of arr) {
      const rec = entry as Record<string, unknown> | null;
      if (!rec) continue;
      const artifact = rec[artifactKey] as Record<string, unknown> | undefined;
      if (artifact && typeof artifact.uri === 'string') return artifact.uri;
    }
    return null;
  }

  const resolveUrl = (uri: string | null): string | null => (uri ? (azureUriToUrl(uri) || uri) : null);

  try {
    const res = await authenticatedFetch(
      `/api/result/${workflowId}`,
    );
    if (!res.ok) return { glb_url: null, threedm_url: null, azure_source: null, not_all_solid: false };

    const data = await res.json() as Record<string, unknown>;

    // 0. ring_cad_nurbs_v1's flat (or sink-node-keyed) result shape, tried
    // first — but only when the response isn't one of the older workflows'
    // known sink shapes. parseRingCadResult's deep search would otherwise
    // find artifacts nested inside success_final/build_retry/etc and bypass
    // the legacy precedence rules (success_final > success_original_glb >
    // failed_final's build_initial-only rule > build_retry) below.
    const LEGACY_SINK_KEYS = ['success_final', 'success_original_glb', 'failed_final', 'build_retry', 'build_initial'];
    const isLegacyShape = LEGACY_SINK_KEYS.some((key) => key in data);
    if (!isLegacyShape) {
      try {
        const flat = parseRingCadResult(data);
        return {
          glb_url: flat.glbArtifact?.url ?? null,
          threedm_url: flat.threedmArtifact?.url ?? null,
          azure_source: flat.sourceStage,
          not_all_solid: flat.notAllSolid,
        };
      } catch {
        // Not a ring_cad_nurbs_v1 result — fall through to the legacy nested shape.
      }
    }

    // 1. success_final: prefer glb_artifact (final output), fallback original_glb_artifact
    const finalUri = extractArtifactUri(data, 'success_final', 'glb_artifact')
      || extractArtifactUri(data, 'success_final', 'original_glb_artifact');
    if (finalUri) {
      return { glb_url: resolveUrl(finalUri), threedm_url: null, azure_source: 'success_final', not_all_solid: false };
    }

    // 2. success_original_glb: use original_glb_artifact only
    const originalUri = extractArtifactUri(data, 'success_original_glb', 'original_glb_artifact');
    if (originalUri) {
      return { glb_url: resolveUrl(originalUri), threedm_url: null, azure_source: 'success_original_glb', not_all_solid: false };
    }

    // 3. failed_final: only build_initial is allowed as fallback
    const failedArr = data['failed_final'];
    if (Array.isArray(failedArr) && failedArr.length > 0) {
      const failedInitialUri = extractArtifactUri(data, 'build_initial', 'glb_artifact')
        || extractArtifactUri(data, 'build_initial', 'original_glb_artifact');
      if (failedInitialUri) {
        return { glb_url: resolveUrl(failedInitialUri), threedm_url: null, azure_source: 'build_initial', not_all_solid: false };
      }
      return { glb_url: null, threedm_url: null, azure_source: 'failed_final', not_all_solid: false };
    }

    // 4. ring_edit_v1 currently returns build nodes rather than success sinks.
    const buildUri = extractArtifactUri(data, 'build_retry', 'glb_artifact')
      || extractArtifactUri(data, 'build_retry', 'original_glb_artifact')
      || extractArtifactUri(data, 'build_initial', 'glb_artifact')
      || extractArtifactUri(data, 'build_initial', 'original_glb_artifact');
    if (buildUri) {
      return { glb_url: resolveUrl(buildUri), threedm_url: null, azure_source: 'build_retry', not_all_solid: false };
    }

    return { glb_url: null, threedm_url: null, azure_source: null, not_all_solid: false };
  } catch (e) {
    if (__DEV__) console.warn('[HistoryAPI] fetchCadResult error:', workflowId, e);
    return { glb_url: null, threedm_url: null, azure_source: null, not_all_solid: false };
  }
}
