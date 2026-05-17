/**
 * Shared extraction helpers for generation history enrichment.
 * Used by both the Generations page and the prefetch hook.
 */
import { azureUriToUrl } from '@/lib/azure-utils';

// ── Helpers ──────────────────────────────────────────────────────────

function findAzureUri(obj: unknown): string | null {
  if (typeof obj === 'string' && obj.startsWith('azure://')) return obj;
  if (Array.isArray(obj)) {
    for (const item of obj) { const f = findAzureUri(item); if (f) return f; }
  } else if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj as Record<string, unknown>)) {
      const found = findAzureUri(v);
      if (found) return found;
    }
  }
  return null;
}

function normalizeImageUrl(value: string): string | null {
  if (!value) return null;
  if (value.startsWith('azure://')) return azureUriToUrl(value);
  if (value.startsWith('http') || value.startsWith('data:') || value.startsWith('blob:')) return value;
  return null;
}

function findBase64Image(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findBase64Image(item);
      if (found) return found;
    }
    return null;
  }

  const record = obj as Record<string, unknown>;
  const b64 = typeof record.image_b64 === 'string' ? record.image_b64 : null;
  if (b64 && b64.length > 0) {
    const mime = typeof record.mime_type === 'string' && record.mime_type.length > 0
      ? record.mime_type
      : 'image/jpeg';
    return `data:${mime};base64,${b64}`;
  }

  for (const value of Object.values(record)) {
    const found = findBase64Image(value);
    if (found) return found;
  }
  return null;
}

function findKeyedImageUrl(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findKeyedImageUrl(item);
      if (found) return found;
    }
    return null;
  }

  const record = obj as Record<string, unknown>;
  for (const key of ['output_url', 'image_url', 'result_url', 'url', 'output_image']) {
    const value = record[key];
    if (typeof value === 'string') {
      const normalized = normalizeImageUrl(value);
      if (normalized) return normalized;
    }
    if (value && typeof value === 'object') {
      const found = findKeyedImageUrl(value);
      if (found) return found;
    }
  }

  for (const value of Object.values(record)) {
    const found = findKeyedImageUrl(value);
    if (found) return found;
  }
  return null;
}

// ── Photo thumbnail extraction ───────────────────────────────────────

export function extractPhotoThumbnail(steps: any[]): string | null {
  // Match generate_jewelry_image, generate_jewelry_image_2k, generate_jewelry_image_4k, etc.
  const genStep = steps.find((s: any) => typeof s.tool === 'string' && s.tool.startsWith('generate_jewelry_image'));
  if (!genStep?.output) return null;
  const out = genStep.output as any;
  const b64: string | undefined = out?.image_b64 ?? out?.result?.image_b64;
  const mime: string = out?.mime_type ?? out?.result?.mime_type ?? 'image/jpeg';
  if (typeof b64 === 'string') return `data:${mime};base64,${b64}`;
  const outputUrl: string | undefined = out?.output_url ?? out?.result?.output_url;
  if (typeof outputUrl === 'string' && outputUrl.startsWith('https://')) return outputUrl;
  // Also handle azure:// URIs returned by higher-res workflows
  const azureUri: string | undefined = out?.output_url ?? out?.result?.output_url ?? findAzureUri(out) ?? undefined;
  if (typeof azureUri === 'string' && azureUri.startsWith('azure://')) return azureUriToUrl(azureUri);
  return null;
}

// ── Product shot thumbnail extraction ───────────────────────────────
// Same approach as model shot: caller fetches getWorkflowDetails, passes steps here.

export function extractProductShotThumbnail(steps: any[]): string | null {
  for (const step of steps) {
    const out = step?.output_data ?? step?.output ?? {};
    const b64 = findBase64Image(out);
    if (b64) return b64;
    const directUrl = findKeyedImageUrl(out);
    if (directUrl) return directUrl;
    const uri = findAzureUri(out);
    if (uri) return azureUriToUrl(uri);
  }
  return null;
}

// ── CAD text data extraction ─────────────────────────────────────────

export function extractCadTextData(steps: any[]) {
  let screenshots: { angle: string; url: string }[] = [];
  let glb_url: string | null = null;
  let glb_filename: string | null = null;

  // Normalize: backend may use output or output_data
  const getOutput = (s: any) => s?.output_data ?? s?.output ?? {};

  const blenderStep = steps.find(
    (s: any) => {
      const out = getOutput(s);
      return s.tool === 'run_blender' &&
        out?.success === true &&
        (out?.screenshots as any[])?.length > 0;
    },
  ) ?? null;

  if (blenderStep) {
    const blenderOut = getOutput(blenderStep);
    const glbUri = blenderOut.glb_artifact?.uri;
    if (glbUri) {
      glb_url = azureUriToUrl(glbUri);
      const parts = String(glbUri).split('/');
      glb_filename = parts[parts.length - 1] || 'model.glb';
    }
    const rawShots = blenderOut.screenshots as any[] | undefined;
    if (rawShots?.length) {
      screenshots = rawShots
        .map((s: any, i: number) => {
          const uri = s?.uri;
          if (uri) return { angle: `angle_${i + 1}`, url: azureUriToUrl(uri) };
          return null;
        })
        .filter((s): s is { angle: string; url: string } => !!s);
    }
  }

  if (screenshots.length === 0) {
    const screenshotStep = steps.find((s: any) =>
      s.tool === 'ring-screenshot' || s.tool === 'screenshot' || s.tool === 'ring_screenshot'
    );
    const ssOut = getOutput(screenshotStep);
    const rawShots = (ssOut?.screenshots ?? ssOut?.images) as any[] | undefined;
    if (rawShots?.length) {
      screenshots = rawShots
        .map((s: any) => {
          const angle = (s.name as string) || (s.angle as string) || 'unknown';
          const rawUri: string | undefined = s?.data_uri?.uri ?? s?.url ?? s?.uri;
          if (rawUri) return { angle, url: azureUriToUrl(rawUri) };
          const uri = findAzureUri(s);
          return uri ? { angle, url: azureUriToUrl(uri) } : null;
        })
        .filter((s): s is { angle: string; url: string } => !!s?.url);
    }
  }

  if (!glb_url) {
    const validateStep = steps.find((s: any) => s.tool === 'ring-validate' || s.tool === 'ring_validate');
    const generateStep = steps.find((s: any) => s.tool === 'ring-generate' || s.tool === 'ring_generate' || s.tool === 'generate');
    const glbStep = validateStep || generateStep;
    const glbOut = getOutput(glbStep);
    if (glbOut?.glb_path) {
      const glbPath = glbOut.glb_path as any;
      const uri = typeof glbPath === 'string' ? glbPath : glbPath?.uri;
      if (uri) {
        glb_url = azureUriToUrl(uri);
        const parts = (uri as string).split('/');
        glb_filename = parts[parts.length - 1] || 'model.glb';
      }
    }
    if (!glb_url && glbOut) {
      const uri = findAzureUri(glbOut);
      if (uri) {
        glb_url = azureUriToUrl(uri);
        const parts = uri.split('/');
        glb_filename = parts[parts.length - 1] || 'model.glb';
      }
    }
    if (!glb_url) {
      for (const step of steps) {
        const uri = findAzureUri(getOutput(step));
        if (uri && uri.includes('.glb')) {
          glb_url = azureUriToUrl(uri);
          const parts = uri.split('/');
          glb_filename = parts[parts.length - 1] || 'model.glb';
          break;
        }
      }
    }
  }

  let ai_model: string | null = null;
  for (const step of steps) {
    const model = step.input?.model ?? step.input?.ai_model;
    if (typeof model === 'string' && model.length > 0) {
      ai_model = model;
      break;
    }
  }

  const front = screenshots[0];
  return { thumbnail_url: front?.url ?? '', screenshots, glb_url, glb_filename, ai_model };
}
