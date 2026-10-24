/**
 * CAD result fetch — extracted from generation-history-api.ts to keep that
 * file under AI_RULES.md's file-size guideline. Same module, same
 * conventions; split purely by concern (this is a single self-contained
 * fetch/parse function with no dependency on the rest of that file).
 */
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { azureUriToUrl } from '@/lib/azure-utils';
import { fetchCadRings } from '@/lib/cad-versions-api';
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
  /**
   * True when /result answered 409: a supervised run waiting in the queue or
   * for review. It is still running, not failed, and can stay so for hours.
   */
  pending: boolean;
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
    if (res.status === 409) return { glb_url: null, threedm_url: null, azure_source: null, not_all_solid: false, pending: true };
    if (!res.ok) return { glb_url: null, threedm_url: null, azure_source: null, not_all_solid: false, pending: false };

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
          pending: false,
        };
      } catch {
        // No model in the body. A delivered hand-made replacement answers
        // {"supervised_delivery": [...]}; its model is in the vault instead.
        if (!isExplicitCadFailure(data)) {
          const vault = await findVaultModelForWorkflow(workflowId, outputAssetIdOf(data));
          if (vault) {
            return { glb_url: vault.glbUrl, threedm_url: vault.threedmUrl, azure_source: 'cad_models', not_all_solid: false, pending: false };
          }
        }
        // Not a ring_cad_nurbs_v1 result — fall through to the legacy nested shape.
      }
    }

    // 1. success_final: prefer glb_artifact (final output), fallback original_glb_artifact
    const finalUri = extractArtifactUri(data, 'success_final', 'glb_artifact')
      || extractArtifactUri(data, 'success_final', 'original_glb_artifact');
    if (finalUri) {
      return { glb_url: resolveUrl(finalUri), threedm_url: null, azure_source: 'success_final', not_all_solid: false, pending: false };
    }

    // 2. success_original_glb: use original_glb_artifact only
    const originalUri = extractArtifactUri(data, 'success_original_glb', 'original_glb_artifact');
    if (originalUri) {
      return { glb_url: resolveUrl(originalUri), threedm_url: null, azure_source: 'success_original_glb', not_all_solid: false, pending: false };
    }

    // 3. failed_final: only build_initial is allowed as fallback
    const failedArr = data['failed_final'];
    if (Array.isArray(failedArr) && failedArr.length > 0) {
      const failedInitialUri = extractArtifactUri(data, 'build_initial', 'glb_artifact')
        || extractArtifactUri(data, 'build_initial', 'original_glb_artifact');
      if (failedInitialUri) {
        return { glb_url: resolveUrl(failedInitialUri), threedm_url: null, azure_source: 'build_initial', not_all_solid: false, pending: false };
      }
      return { glb_url: null, threedm_url: null, azure_source: 'failed_final', not_all_solid: false, pending: false };
    }

    // 4. ring_edit_v1 currently returns build nodes rather than success sinks.
    const buildUri = extractArtifactUri(data, 'build_retry', 'glb_artifact')
      || extractArtifactUri(data, 'build_retry', 'original_glb_artifact')
      || extractArtifactUri(data, 'build_initial', 'glb_artifact')
      || extractArtifactUri(data, 'build_initial', 'original_glb_artifact');
    if (buildUri) {
      return { glb_url: resolveUrl(buildUri), threedm_url: null, azure_source: 'build_retry', not_all_solid: false, pending: false };
    }

    return { glb_url: null, threedm_url: null, azure_source: null, not_all_solid: false, pending: false };
  } catch (e) {
    if (__DEV__) console.warn('[HistoryAPI] fetchCadResult error:', workflowId, e);
    return { glb_url: null, threedm_url: null, azure_source: null, not_all_solid: false, pending: false };
  }
}

/** The files of a finished CAD run, whichever source they came from. */
export interface CadModelUrls {
  glbUrl: string | null;
  threedmUrl: string | null;
  stlUrls: string[];
  stepUrls: string[];
  estimatedMetalMassG: number | null;
  notAllSolid: boolean;
}

/** A /result body that itself says the run failed; no model is looked for elsewhere. */
export function isExplicitCadFailure(raw: unknown): boolean {
  const d = raw as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return false;
  return d.ok === false || (typeof d.status === 'string' && d.status.toLowerCase() === 'failed');
}

/** The top-level output_asset_id of a /result body: the delivered version's asset_id. */
function outputAssetIdOf(raw: unknown): string | null {
  const id = (raw as Record<string, unknown> | null)?.output_asset_id;
  return typeof id === 'string' && id ? id : null;
}

/**
 * The model the CAD vault (GET /cad/models) holds for this run.
 *
 * The vault is right for every run, including a supervised one the CAD team
 * replaced by hand, whose /result has no model fields. Backend contract
 * (2026-10-24): /result's output_asset_id is the delivered version's asset_id,
 * and /result answers only after that version is saved, so one read is enough.
 * Without an output_asset_id, the version this run produced is used. The
 * delivered version is among the newest, so the first page is enough.
 */
export async function findVaultModelForWorkflow(
  workflowId: string,
  outputAssetId: string | null = null,
): Promise<{ glbUrl: string | null; threedmUrl: string | null } | null> {
  let rings: Awaited<ReturnType<typeof fetchCadRings>>;
  try {
    rings = await fetchCadRings();
  } catch {
    return null;
  }
  const versions = rings.flatMap((ring) => ring.versions ?? []);
  const version = (outputAssetId ? versions.find((v) => v.asset_id === outputAssetId) : undefined)
    ?? versions.find((v) => v.source_workflow_id === workflowId);
  if (!version || (!version.glb_url && !version.threedm_url)) return null;
  return { glbUrl: version.glb_url ?? null, threedmUrl: version.threedm_url ?? null };
}

/**
 * The model of a run /status reported completed: from the /result body, or
 * else from the vault. Null only when neither has one, i.e. a real failure.
 */
export async function resolveCadModel(workflowId: string, raw: unknown): Promise<CadModelUrls | null> {
  try {
    const parsed = parseRingCadResult(raw);
    return {
      glbUrl: parsed.glbUrl,
      threedmUrl: parsed.threedmArtifact?.url ?? null,
      stlUrls: parsed.stlArtifacts.map((artifact) => artifact.url),
      stepUrls: parsed.stepArtifacts.map((artifact) => artifact.url),
      estimatedMetalMassG: parsed.estimatedMetalMassG,
      notAllSolid: parsed.notAllSolid,
    };
  } catch {
    if (isExplicitCadFailure(raw)) return null;
    const vault = await findVaultModelForWorkflow(workflowId, outputAssetIdOf(raw));
    return vault ? { ...vault, stlUrls: [], stepUrls: [], estimatedMetalMassG: null, notAllSolid: false } : null;
  }
}


/**
 * The inputs a finished run was made from: its reference photos and its text.
 *
 * Restoring a run rebuilds the model but not the brief that produced it, so a
 * ring opened from history showed an empty left panel — no photos, no
 * description, nothing to say what it was made from. The history list carries
 * both, so this reads them back by workflow id rather than asking the user to
 * remember.
 *
 * Returns empty values rather than throwing: the panel is worth showing even
 * when the lookup fails, and the model is already on screen by then.
 */
export async function fetchCadRunInputs(
  workflowId: string,
): Promise<{ referenceImageUrls: string[]; prompt: string | null }> {
  const { listMyWorkflows } = await import('@/lib/generation-history-api');
  try {
    const rows = await listMyWorkflows(100, 0);
    const row = rows.find((w) => w.workflow_id === workflowId);
    return {
      referenceImageUrls: row?.reference_image_urls ?? [],
      prompt: row?.prompt ?? null,
    };
  } catch {
    return { referenceImageUrls: [], prompt: null };
  }
}
