import { useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ImageOff,
  Loader2,
  MessageSquareWarning,
} from 'lucide-react';

import { azureUriToUrl } from '@/lib/azure-utils';
import {
  AdminGenerationsApiError,
  getAdminGenerationDetail,
  listAdminGenerations,
  type AdminGenerationDetail,
} from '@/lib/admin-generations-api';
import { cadTierText } from '@/lib/cad-model-options';
import { getSupervisedRun, SupervisedRunsApiError } from '@/lib/supervised-runs-api';
import { fetchCadResult, resolveSourceType } from '@/lib/generation-history-api';
import { parseRingCadResult } from '@/lib/ring-cad-nurbs-api';
import { cadFlowLabel, isDesignImageWorkflow, readCadStudioInputs, type AdminRunInputs } from '@/lib/admin-generation-inputs';
import {
  cadDesignArtifact,
  mayHaveDesignHistory,
  designStepLabel,
  startedFromDoodle,
  traceDesignHistory,
  type DesignHistory,
} from '@/lib/admin-design-history';
import type { AdminGenerationStep } from '@/lib/admin-generations-api';
import { ScissorGLBGrid, GLBPreviewSlot } from '@/components/generations/ScissorGLBGrid';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { parseServerTime } from '@/lib/server-time';
import { costView, USER_PAID_HELP, WORKFLOW_COST_HELP } from '@/lib/admin-cost-display';
import { readProviderSpend } from '@/lib/admin-provider-spend';
import { buildRunView } from '@/lib/admin-workflow-views';
import { findNodes } from '@/lib/admin-workflow-views/walker';
import { buildIoSummary } from '@/lib/admin-workflow-views/io-summary';
import { CostLabel, ProviderSpendBlock, WorkflowCostValue } from '@/components/admin/AdminCost';
import { FileLink } from '@/components/admin/workflow-view/FileLink';
import { ImageThumb } from '@/components/admin/workflow-view/ImageThumb';
import { IoSummarySection } from '@/components/admin/workflow-view/IoSummary';
import { JsonBlock } from '@/components/admin/workflow-view/JsonBlock';
import { LabelledValue } from '@/components/admin/workflow-view/LabelledValue';
import { NodeView } from '@/components/admin/workflow-view/NodeView';
import { StepTimeline } from '@/components/admin/workflow-view/StepTimeline';

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parseServerTime(value));
}

function formatUserType(value: string | null): string {
  if (!value) return '-';
  return value.replace(/_/g, ' ');
}

function extractTypedImageArtifacts(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const root = value as Record<string, unknown>;
  const candidates = [root.reference_image_artifacts, root.image_artifacts, root.reference_images];
  return candidates.flatMap((candidate) => Array.isArray(candidate) ? candidate : [])
    .flatMap((entry) => {
      if (typeof entry === 'string') return isRenderableUrl(entry) ? [entry] : [];
      if (!entry || typeof entry !== 'object') return [];
      const artifact = entry as Record<string, unknown>;
      const mime = typeof artifact.type === 'string' ? artifact.type : typeof artifact.mime === 'string' ? artifact.mime : '';
      const url = typeof artifact.url === 'string' ? artifact.url : typeof artifact.uri === 'string' ? artifact.uri : null;
      return mime.toLowerCase().startsWith('image/') && url && isRenderableUrl(url) ? [url] : [];
    });
}

function isRenderableUrl(value: string | null): boolean {
  if (!value) return false;
  return value.startsWith('https://') || value.startsWith('http://') || value.startsWith('azure://') || value.includes('/artifacts/');
}

function normalizeRenderableUrl(value: string | null): string | null {
  if (!value) return null;
  if (!isRenderableUrl(value)) return null;
  return azureUriToUrl(value) || value;
}

function findString(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== 'object') return null;

  for (const key of keys) {
    const candidate = (value as Record<string, unknown>)[key];
    if (typeof candidate === 'string' && candidate) {
      return candidate;
    }
  }

  return null;
}

function findStringArray(value: unknown, keys: string[]): string[] {
  if (!value || typeof value !== 'object') return [];

  for (const key of keys) {
    const candidate = (value as Record<string, unknown>)[key];
    if (Array.isArray(candidate)) {
      return candidate.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
    }
  }

  return [];
}

function findText(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== 'object') return null;

  for (const key of keys) {
    const candidate = (value as Record<string, unknown>)[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function getReferenceImageCount(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const root = value as Record<string, unknown>;
  const nested = root.payload && typeof root.payload === 'object'
    ? root.payload as Record<string, unknown>
    : null;

  for (const candidate of [root, nested]) {
    if (!candidate) continue;
    if (typeof candidate.reference_image_count === 'number') {
      return candidate.reference_image_count;
    }
    for (const key of ['reference_images', 'reference_image_urls']) {
      if (Array.isArray(candidate[key])) return candidate[key].length;
    }
  }
  return null;
}

function extractGlbFromSteps(steps: AdminGenerationStep[]): string | null {
  function deepFindGlbUri(node: unknown): string | null {
    if (typeof node === 'string' && node.includes('.glb')) {
      if (node.startsWith('azure://') || node.startsWith('https://') || node.includes('/artifacts/')) return node;
    }
    if (Array.isArray(node)) {
      for (const item of node) { const f = deepFindGlbUri(item); if (f) return f; }
    } else if (node && typeof node === 'object') {
      for (const v of Object.values(node as Record<string, unknown>)) {
        const f = deepFindGlbUri(v); if (f) return f;
      }
    }
    return null;
  }

  // ring_cad_nurbs_v1 steps nest the artifact under a `result` (or sink-node)
  // wrapper and use extensionless content-addressed proxy URLs (/api/artifacts/
  // <sha256>, no ".glb" suffix), which the string-matching fallback below can
  // never find. Try the shared, key-based parser first — it already handles
  // both the nesting and the extensionless URL shape (see ring-cad-nurbs-api.ts).
  for (const step of steps) {
    const out = step.output as Record<string, unknown> | null;
    if (!out) continue;
    try {
      const parsed = parseRingCadResult(out);
      if (parsed.glbArtifact?.url) return parsed.glbArtifact.url;
    } catch {
      // Not a ring_cad_nurbs_v1-shaped step — fall through to the checks below.
    }
  }

  for (const step of steps) {
    const out = step.output as Record<string, unknown> | null;
    if (!out) continue;
    // Prefer a backend-signed url when present; otherwise resolve the azure://
    // reference. Never fall back to the raw uri: azure:// cannot be fetched, so
    // returning it guarantees the viewer fails instead of showing "No 3D output".
    const glbArt = (out.glb_artifact ?? out.original_glb_artifact) as { url?: unknown; uri?: unknown } | null | undefined;
    const glbArtUrl = typeof glbArt?.url === 'string' ? glbArt.url : undefined;
    if (glbArtUrl) return glbArtUrl;
    if (typeof glbArt?.uri === 'string') {
      const resolved = azureUriToUrl(glbArt.uri);
      if (resolved) return resolved;
    }
    const glbPath = out.glb_path;
    if (glbPath) {
      const p = typeof glbPath === 'string' ? glbPath : (glbPath as { uri?: unknown } | null)?.uri;
      if (typeof p === 'string') {
        const resolved = azureUriToUrl(p);
        if (resolved) return resolved;
      }
    }
  }
  for (const step of steps) {
    const uri = deepFindGlbUri(step.output);
    if (uri) {
      const resolved = azureUriToUrl(uri);
      if (resolved) return resolved;
    }
  }
  return null;
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'completed' ? 'default'
      : status === 'failed' ? 'destructive'
        : 'secondary';
  return (
    <Badge variant={variant} className="capitalize">
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}

function PayingBadge({ isPaying }: { isPaying: boolean }) {
  return <Badge variant={isPaying ? 'default' : 'outline'}>{isPaying ? 'Paying' : 'Free'}</Badge>;
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function CollapsibleCardSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader>
          <CollapsibleTrigger asChild>
            <button type="button" className="flex w-full items-center justify-between text-left">
              <CardTitle className="font-display text-2xl tracking-wide">{title}</CardTitle>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>{children}</CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

/** What the customer sent: prompt, details and every picture with its role. */
function StudioInputs({ inputs }: { inputs: AdminRunInputs }) {
  return (
    <div className="space-y-4">
      {inputs.prompt && (
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Prompt (Input)</p>
          <div className="rounded-md border border-border bg-muted/20 px-4 py-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{inputs.prompt}</p>
          </div>
        </div>
      )}
      {inputs.details.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {inputs.details.map((d) => <MetaItem key={d.label} label={d.label} value={d.value} />)}
        </div>
      )}
      {inputs.images.length > 0 && (
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Images (Input)</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {inputs.images.map((image, index) => (
              <ImageThumb key={`${image.url}-${index}`} url={image.url} label={image.label} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The design pictures behind a CAD from Idea / Doodle / Inspiration: what the
 * customer drew or sent, what they wrote, and each change made in the design
 * editor (with the marked-up picture), earliest first.
 */
function DesignHistorySection({ history }: { history: DesignHistory }) {
  return (
    <div className="space-y-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Design steps (Input)</p>
      {history.brokenAtMarkup && (
        <p className="text-xs text-muted-foreground">
          Earlier steps are not linked: the design editor does not record which design was marked up.
        </p>
      )}
      <ol className="space-y-3">
        {history.steps.map((step, index) => (
          <li key={step.workflowId} className="space-y-3 rounded-md border border-border p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{index + 1}. {designStepLabel(step.kind)}{step.view ? ` (${step.view})` : ''}</p>
              <Link
                to={`/admin/generations/${encodeURIComponent(step.workflowId)}`}
                className="break-all font-mono text-[10px] uppercase tracking-widest text-muted-foreground underline-offset-2 hover:underline"
              >
                {step.workflowId}
              </Link>
            </div>
            <div className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {step.kind === 'doodle' ? 'About the drawing' : step.kind === 'edit' || step.kind === 'annotated_edit' ? 'Change asked' : 'Customer text'}
              </p>
              <div className="rounded-md border border-border bg-muted/20 px-4 py-3">
                {step.text ? (
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{step.text}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nothing written{step.defaultText ? ` (sent: "${step.defaultText}")` : ''}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {step.images.map((image, i) => (
                <ImageThumb key={`${image.url}-${i}`} url={image.url} label={image.label} />
              ))}
              {step.outputUrl && <ImageThumb url={step.outputUrl} label="Design made" />}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function NotAuthorizedState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <AlertTriangle className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-2xl tracking-wide">Not Authorized</h2>
          <p className="text-sm text-muted-foreground">
            Your account is authenticated, but the backend did not authorize access to this generation detail.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function NotFoundState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <MessageSquareWarning className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-2xl tracking-wide">Generation Not Found</h2>
          <p className="text-sm text-muted-foreground">
            The requested workflow could not be found in the current tenant.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function InvalidRequestState({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <AlertTriangle className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-2xl tracking-wide">Invalid Request</h2>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function submittedTier(payload: unknown, key: string): string | null {
  const read = (value: unknown): string | null => {
    const v = value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : null;
    return typeof v === 'string' && v ? v : null;
  };
  const nested = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).payload : null;
  return read(payload) ?? read(nested);
}

function tiersText(build: string | null | undefined, review: string | null | undefined): string {
  return `Build AI ${cadTierText(build)} · Review AI ${cadTierText(review)}`;
}

/**
 * What the customer sent with a run: the CAD studio inputs (prompt, pictures, details), the design
 * steps behind a CAD from a design picture, and every jewelry image the payload carries. Shared by
 * DetailContent and RunInputsPanel so both read the inputs the same way.
 */
function useCadRunInputs(detail: AdminGenerationDetail) {
  const referenceImageCount = getReferenceImageCount(detail.input_payload);
  const cadSourceType = resolveSourceType(detail.source_type, detail.workflow_name, referenceImageCount);
  const isCadModel = cadSourceType === 'text_to_cad' || cadSourceType === 'image_to_cad';
  // CAD studio runs (design pictures, and CAD from Image / Idea / Inspiration)
  // keep their inputs in shapes the generic finders below don't read.
  const studioInputsRaw = readCadStudioInputs(detail.workflow_name, detail.input_payload, isCadModel);
  // A CAD from a design picture: walk back to the doodle / words / edits behind it.
  const designArtifact = isCadModel ? cadDesignArtifact(detail.input_payload) : null;
  const designHistoryQuery = useQuery({
    queryKey: ['admin-design-history', detail.workflow_id],
    queryFn: () => traceDesignHistory(designArtifact, detail.created_at || null, {
      fetchRun: getAdminGenerationDetail,
      // The customer's own design pictures, to match the CAD's picture against.
      listRuns: async () => !detail.user_email ? [] : (await listAdminGenerations({ user_email: detail.user_email, workflow_name: 'design_image_v1', limit: 100 }))
        .items.filter((item) => isDesignImageWorkflow(item.workflow_name)),
    }),
    enabled: isCadModel && mayHaveDesignHistory(detail.input_payload),
    staleTime: Infinity,
    retry: false,
  });
  const designHistory = designHistoryQuery.data ?? null;
  const fromDoodle = startedFromDoodle(designHistory);
  // The CAD payload says "idea" for both words and drawings; the trail tells them apart.
  const studioInputs = studioInputsRaw && fromDoodle
    ? { ...studioInputsRaw, details: studioInputsRaw.details.map((d) => (d.label === 'Flow' ? { ...d, value: 'CAD from Doodle' } : d)) }
    : studioInputsRaw;
  // Derivative runs (upscale) store their source under `image` — either a bare
  // string or `{ uri }` — with no jewelry_image_url. Surface it so the workflow's
  // input still renders in the admin detail.
  const derivativeSourceUrl = (() => {
    const img = (detail.input_payload as Record<string, unknown> | null)?.image;
    if (typeof img === 'string') return img;
    if (img && typeof img === 'object' && typeof (img as Record<string, unknown>).uri === 'string') {
      return (img as Record<string, unknown>).uri as string;
    }
    return null;
  })();
  // The request wraps everything as { payload: {...} }, so image fields live one
  // level down (input_payload.payload.*) - the shallow finders miss them at the top
  // level. Search the raw payload, its nested payload, and the first step's resolved
  // input so the full jewelry_image_urls array (High Effort) is always found.
  const payloadRoots: unknown[] = [
    detail.input_payload,
    (detail.input_payload as Record<string, unknown> | null)?.payload,
    detail.steps[0]?.input,
  ];
  const jewelryInputUrls = [...new Set(
    [
      ...payloadRoots.flatMap((root) => [
        ...extractTypedImageArtifacts(root),
        ...findStringArray(root, ['jewelry_image_urls', 'input_image_urls', 'input_images']),
        ...['jewelry_image_url', 'input_image_url', 'image_url', 'source_image_url']
          .map((key) => findString(root, [key]))
          .filter((value): value is string => Boolean(value)),
      ]),
      ...(derivativeSourceUrl ? [derivativeSourceUrl] : []),
    ]
      .map((value) => normalizeRenderableUrl(value))
      .filter((value): value is string => Boolean(value)),
  )];
  // Older CAD workflows keep the prompt and pictures under other keys; the
  // previous finders still apply whenever the studio reader comes back empty.
  const cadInputs = isCadModel && studioInputs
    ? {
        ...studioInputs,
        prompt: studioInputs.prompt
          ?? findText(detail.input_payload, ['prompt', 'description', 'ring_description', 'text_input', 'input_text', 'text', 'query', 'user_description']),
        images: studioInputs.images.length
          ? studioInputs.images
          : jewelryInputUrls.map((url, index) => ({ url, label: `Uploaded Image ${index + 1}` })),
      }
    : null;
  return {
    cadSourceType, isCadModel, studioInputs, designHistory, designHistoryQuery, fromDoodle,
    payloadRoots, jewelryInputUrls, cadInputs,
  };
}

/**
 * The customer's inputs on their own, for pages that put them first (the CAD queue). The same
 * reading as the Visual Summary in DetailContent; nothing here is folded away.
 */
export function RunInputsPanel({ detail }: { detail: AdminGenerationDetail }) {
  const { designHistory, designHistoryQuery, cadInputs, jewelryInputUrls } = useCadRunInputs(detail);
  const hasAnything = Boolean(designHistory || cadInputs || jewelryInputUrls.length);
  return (
    <div className="space-y-4">
      {designHistory ? (
        <DesignHistorySection history={designHistory} />
      ) : designHistoryQuery.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading design steps
        </div>
      ) : null}
      {cadInputs ? (
        <StudioInputs inputs={cadInputs} />
      ) : jewelryInputUrls.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {jewelryInputUrls.map((url, index) => (
            <ImageThumb key={`${url}-${index}`} url={url} label={`Uploaded Image ${index + 1}`} />
          ))}
        </div>
      ) : null}
      {!hasAnything && !designHistoryQuery.isLoading && (
        <p className="text-sm text-muted-foreground">This run carries no prompt or pictures.</p>
      )}
    </div>
  );
}

/** A titled page section; its title names the region (Inputs, Steps, Outputs). */
function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = `admin-section-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={id}>
      <Card>
        <CardHeader>
          <CardTitle id={id} className="font-display text-2xl tracking-wide">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">{children}</CardContent>
      </Card>
    </section>
  );
}

/**
 * Any run, any workflow: the request payload, every step's input and output, and the last
 * successful step's output, all walked schema-free (admin-workflow-views). The family only
 * adds labels and order. CAD runs also get the design trail behind them, and the /result
 * 3DM / GLB as a fallback when no step output carries one.
 */
export function DetailContent({ detail }: { detail: AdminGenerationDetail }) {
  const {
    cadSourceType, isCadModel: isCadSource, designHistory, designHistoryQuery, fromDoodle,
  } = useCadRunInputs(detail);
  const view = useMemo(() => buildRunView(detail, isCadSource), [detail, isCadSource]);
  // cad_to_catalog_* names contain "cad" but are not CAD models; the registry decides.
  const isCadModel = view.family === 'cad_model';
  const failedSteps = view.steps.filter((s) => s.failed).length;
  const cost = costView(detail.actual_cost, detail.total_provider_cost, { failedSteps });
  const spend = useMemo(() => readProviderSpend(detail.steps), [detail.steps]);
  const cadResultQuery = useQuery({
    queryKey: ['admin-cad-result', detail.workflow_id],
    queryFn: () => fetchCadResult(detail.workflow_id),
    enabled: isCadModel && detail.status === 'completed',
    staleTime: Infinity,
    retry: 1,
  });
  // Only supervised runs have one; a plain generation answers not found, which is not an error here.
  const supervisedQuery = useQuery({
    queryKey: ['admin-generation-supervised-tiers', detail.workflow_id],
    queryFn: async () => {
      try {
        return await getSupervisedRun(detail.workflow_id);
      } catch (error) {
        if (error instanceof SupervisedRunsApiError && (error.status === 404 || error.code === 'not_found')) return null;
        throw error;
      }
    },
    enabled: isCadModel,
    staleTime: 60_000,
    retry: false,
  });
  const appliedTiers = supervisedQuery.data?.supervision.tiers ?? null;
  // Files from the step outputs come first: /api/result/{id} answers 403 to an admin
  // viewing another user's run (docs/admin-backend-handoff-2026-11-02.md), so it is only a
  // fallback when the final output carries no 3DM / GLB.
  const outputMedia = view.outputs ? findNodes(view.outputs.node, (n) => n.kind === 'media') : [];
  const hasModel = outputMedia.some((n) => n.kind === 'media' && n.media === 'model3d');
  const has3dm = outputMedia.some((n) => n.kind === 'media' && n.ext === '3dm');
  const fallbackGlb = isCadModel && !hasModel ? cadResultQuery.data?.glb_url ?? extractGlbFromSteps(detail.steps) : null;
  const fallback3dm = isCadModel && !has3dm ? cadResultQuery.data?.threedm_url ?? null : null;
  const complaintOutput = !view.outputs ? detail.feedback?.output_image_url ?? null : null;
  const cadSourceLabel = !isCadModel ? null : fromDoodle ? 'CAD from Doodle' : cadFlowLabel(detail.input_payload) ?? (cadSourceType === 'text_to_cad'
    ? 'Text to CAD'
    : cadSourceType === 'image_to_cad'
      ? 'Image to CAD'
      : null);
  const opts = { enh: view.enh, fallbackStem: detail.workflow_id };
  const ioSummary = useMemo(() => buildIoSummary(view, {
    resultFiles: [
      { label: '3D (from the run result)', url: fallbackGlb, format: 'glb' },
      { label: '3DM (from the run result)', url: fallback3dm, format: '3dm' },
    ],
  }), [view, fallbackGlb, fallback3dm]);

  return (
    <div className="space-y-6">
      <section aria-labelledby="admin-section-run">
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <p id="admin-section-run" className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Run</p>
                <CardTitle className="break-all font-display text-3xl tracking-wide">
                  {detail.workflow_name || detail.workflow_id}
                </CardTitle>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={detail.status} />
                <PayingBadge isPaying={detail.is_paying} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <MetaItem label="User Email" value={detail.user_email || '-'} />
              <MetaItem label="User Type" value={formatUserType(detail.user_type)} />
              <MetaItem label="Created" value={formatDateTime(detail.created_at)} />
              <MetaItem label="Finished" value={formatDateTime(detail.finished_at)} />
              <LabelledValue label={<CostLabel label="User paid" help={USER_PAID_HELP} />} value={cost.userPaid} />
              <LabelledValue label={<CostLabel label="Workflow cost" help={WORKFLOW_COST_HELP} />} value={<WorkflowCostValue view={cost} detail />} />
              <MetaItem label="Workflow ID" value={detail.workflow_id} />
              <MetaItem label="Status" value={detail.status.replace(/_/g, ' ')} />
              {cadSourceLabel && <MetaItem label="CAD Source" value={cadSourceLabel} />}
              {isCadModel && (
                <div className="space-y-1 sm:col-span-2 lg:col-span-4">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">AI</p>
                  <p className="text-sm">
                    {`Submitted: ${tiersText(submittedTier(detail.input_payload, 'llm_tier'), submittedTier(detail.input_payload, 'analysis_tier'))}`}
                  </p>
                  {appliedTiers && (
                    <p className="text-sm">{`Applied at Start: ${tiersText(appliedTiers.llm_tier, appliedTiers.analysis_tier)}`}</p>
                  )}
                </div>
              )}
            </div>
            <ProviderSpendBlock spend={spend} />
          </CardContent>
        </Card>
      </section>

      <IoSummarySection summary={ioSummary} fallbackStem={detail.workflow_id} />

      <Section title="Inputs">
        {isCadModel && (designHistory ? (
          <DesignHistorySection history={designHistory} />
        ) : designHistoryQuery.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading design steps
          </div>
        ) : null)}
        <NodeView node={view.inputs} opts={opts} />
      </Section>

      <Section title="Steps">
        <StepTimeline steps={view.steps} enh={view.enh} fallbackStem={detail.workflow_id} />
      </Section>

      <Section title="Outputs">
        {view.outputs ? (
          <>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {`From step ${view.outputs.stepIndex}: ${view.outputs.tool}`}
            </p>
            <NodeView node={view.outputs.node} opts={{ ...opts, tool: view.outputs.tool, autoPreview3d: true }} />
          </>
        ) : complaintOutput ? (
          <ImageThumb url={complaintOutput} label="Output image (from complaint)" />
        ) : (
          <p className="text-sm text-muted-foreground">This run recorded no successful step output.</p>
        )}
        {fallbackGlb && (
          <div className="space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">3D preview (from the run result)</p>
            <div className="w-full max-w-2xl">
              <ScissorGLBGrid>
                <GLBPreviewSlot
                  id={detail.workflow_id}
                  glbUrl={fallbackGlb}
                  className="min-h-[320px] w-full aspect-[4/3] rounded-md border border-border bg-muted/20"
                  forceJewelryPalette
                />
              </ScissorGLBGrid>
            </div>
          </div>
        )}
        {fallback3dm && (
          <FileLink file={{ label: '3DM (from the run result)', url: fallback3dm, name: `${detail.workflow_id}.3dm`, bytes: null, ext: '3dm' }} fallbackStem={detail.workflow_id} />
        )}
      </Section>

      <CollapsibleCardSection title="Input Payload">
        <p className="mb-2 text-xs text-muted-foreground">
          Raw JSON shows the submitted request; the AI actually used is under 'Applied at Start'.
        </p>
        <JsonBlock title="Raw JSON" value={detail.input_payload} />
      </CollapsibleCardSection>

      {detail.feedback && (
        <CollapsibleCardSection title="Complaint" defaultOpen>
          <div className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <MetaItem label="Reporter Email" value={detail.feedback.reporter_email || '-'} />
              <MetaItem label="Category" value={detail.feedback.category || '-'} />
              <MetaItem label="Created" value={formatDateTime(detail.feedback.created_at)} />
              <MetaItem label="Feedback ID" value={detail.feedback.id} />
            </div>
            <div className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Complaint Text</p>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{detail.feedback.complaint || '-'}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {(detail.feedback.input_image_urls ?? []).map((url, index) => (
                <ImageThumb key={`${url}-${index}`} url={url} label={`Input Image ${index + 1}`} />
              ))}
              <ImageThumb url={detail.feedback.output_image_url} label="Output Image" />
            </div>
          </div>
        </CollapsibleCardSection>
      )}
    </div>
  );
}

export default function AdminGenerationDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { workflowId = '' } = useParams<{ workflowId: string }>();

  const query = useQuery({
    queryKey: ['admin-generation-detail', workflowId],
    queryFn: () => getAdminGenerationDetail(workflowId),
    enabled: Boolean(workflowId),
    retry: false,
  });

  const error = query.error instanceof AdminGenerationsApiError ? query.error : null;
  const backTarget = `/admin/generations${location.search || ''}`;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate(backTarget)}>
              <ArrowLeft className="h-4 w-4" />
              Back to Generations
            </Button>
            <Button asChild size="sm" className="gap-2">
              <Link to={backTarget}>
                List View
              </Link>
            </Button>
          </div>
        </div>

        {query.isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : error?.status === 401 ? (
          <NotAuthorizedState />
        ) : error?.status === 404 ? (
          <NotFoundState />
        ) : error?.status === 422 ? (
          <InvalidRequestState message={error.message || 'The request was invalid.'} />
        ) : error ? (
          <Card>
            <CardContent className="flex items-center justify-center py-16">
              <p className="text-sm text-muted-foreground">Failed to load generation detail.</p>
            </CardContent>
          </Card>
        ) : query.data ? (
          <DetailContent detail={query.data} />
        ) : (
          <NotFoundState />
        )}
      </div>
    </div>
  );
}
