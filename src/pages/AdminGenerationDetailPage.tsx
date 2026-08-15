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

import { useAuthenticatedImage } from '@/hooks/useAuthenticatedImage';
import { azureUriToUrl } from '@/lib/azure-utils';
import {
  AdminGenerationsApiError,
  getAdminGenerationDetail,
  type AdminGenerationDetail,
} from '@/lib/admin-generations-api';
import { resolveSourceType } from '@/lib/generation-history-api';
import { parseRingCadResult } from '@/lib/ring-cad-nurbs-api';
import type { AdminGenerationStep } from '@/lib/admin-generations-api';
import { ScissorGLBGrid, GLBPreviewSlot } from '@/components/generations/ScissorGLBGrid';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDuration(value: number | null): string {
  if (value === null || value === undefined) return '-';
  return `${value.toLocaleString()} ms`;
}

function formatCredits(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '-';
  return `${new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(value)} credits`;
}

function formatUserType(value: string | null): string {
  if (!value) return '-';
  return value.replace(/_/g, ' ');
}

function extractImageUrls(value: unknown): string[] {
  const urls = new Set<string>();

  function visit(node: unknown) {
    if (typeof node === 'string') {
      const lower = node.toLowerCase();
      if (
        node.startsWith('http://') ||
        node.startsWith('https://') ||
        node.startsWith('azure://') ||
        node.includes('/artifacts/') ||
        /\.(png|jpg|jpeg|webp|gif|bmp|svg)(\?|$)/i.test(lower)
      ) {
        urls.add(node);
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node && typeof node === 'object') {
      Object.values(node as Record<string, unknown>).forEach(visit);
    }
  }

  visit(value);
  return Array.from(urls);
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

function firstRenderableUrl(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = normalizeRenderableUrl(value ?? null);
    if (normalized) return normalized;
  }
  return null;
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
    const glbArt = (out.glb_artifact ?? out.original_glb_artifact) as any;
    const glbArtUrl = typeof glbArt?.url === 'string' ? glbArt.url : undefined;
    if (glbArtUrl) return glbArtUrl;
    if (typeof glbArt?.uri === 'string') {
      const resolved = azureUriToUrl(glbArt.uri);
      if (resolved) return resolved;
    }
    const glbPath = out.glb_path;
    if (glbPath) {
      const p = typeof glbPath === 'string' ? glbPath : (glbPath as any)?.uri;
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

function JsonBlock({ title, value, defaultOpen = false }: { title: string; value: unknown; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const formatted = useMemo(() => JSON.stringify(value ?? {}, null, 2), [value]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-md border border-border">
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{title}</span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border bg-muted/20 p-4">
            <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">
              {formatted}
            </pre>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
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

function ImagePreview({ url, label }: { url: string | null; label: string }) {
  const resolvedUrl = useAuthenticatedImage(url);

  return (
    <div className="space-y-2">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="overflow-hidden rounded-md border border-border bg-muted/20">
        {url ? (
          resolvedUrl ? (
            <img src={resolvedUrl} alt={label} className="max-h-72 w-full object-contain" />
          ) : (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )
        ) : (
          <div className="flex h-40 items-center justify-center">
            <ImageOff className="h-5 w-5 text-muted-foreground/50" />
          </div>
        )}
      </div>
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

function DetailContent({ detail }: { detail: AdminGenerationDetail }) {
  // Both CAD families produce a GLB. cad_sketch (Image to 3D, including
  // ring_cad_nurbs_v1) was excluded here, so its runs always rendered
  // "No 3D output" no matter what the pipeline returned.
  const cadSourceType = resolveSourceType(detail.source_type, detail.workflow_name);
  const isCadModel = cadSourceType === 'cad_text' || cadSourceType === 'cad_sketch';
  const textPrompt = isCadModel
    ? findText(detail.input_payload, ['prompt', 'description', 'ring_description', 'text_input', 'input_text', 'text', 'query', 'user_description'])
    : null;
  const cadGlbUrl = isCadModel ? extractGlbFromSteps(detail.steps) : null;

  const stepOutputImageUrls = detail.steps.flatMap((step) =>
    extractImageUrls(step.output)
      .map((value) => normalizeRenderableUrl(value))
      .filter((value): value is string => Boolean(value)),
  );
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
  const inspirationImageUrl = firstRenderableUrl(
    payloadRoots.flatMap((root) => [
      findString(root, ['inspiration_image_url']),
      ...findStringArray(root, ['inspiration_image_urls']),
    ]),
  );
  const modelImageUrl = firstRenderableUrl(
    payloadRoots.map((root) => findString(root, ['model_image_url', 'model_url'])),
  );
  const outputImageUrl = firstRenderableUrl([
    detail.feedback?.output_image_url ?? null,
    findString(detail.input_payload, ['output_image_url', 'output_url', 'image_url', 'result_url']),
    // Final render is the LAST image produced across steps; earlier steps now emit
    // intermediate images (e.g. the model image), so [0] would mislabel them as output.
    stepOutputImageUrls[stepOutputImageUrls.length - 1],
  ]);
  const category =
    detail.feedback?.category ??
    findText(detail.input_payload, ['category', 'jewelry_category', 'jewelry_type', 'product_category']) ??
    '-';
  const referenceImage = inspirationImageUrl
    ? { url: inspirationImageUrl, label: 'Inspiration Image' }
    : modelImageUrl
      ? { url: modelImageUrl, label: 'Model Image' }
      : null;
  // Show every jewelry input the workflow received (High Effort sends up to 3),
  // not just the cover. Keep a single labeled placeholder when none resolved.
  const jewelryEntries = jewelryInputUrls.length
    ? jewelryInputUrls.map((url, i) => ({
        url,
        label: jewelryInputUrls.length > 1 ? `Jewelry Input ${i + 1}` : 'Jewelry Input',
      }))
    : [{ url: null, label: 'Jewelry Input' }];
  const visualSummaryImages = [
    ...jewelryEntries,
    ...(referenceImage ? [referenceImage] : []),
    { url: outputImageUrl, label: 'Output Image' },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Workflow</p>
              <CardTitle className="font-display text-3xl tracking-wide">
                {detail.workflow_name || detail.workflow_id}
              </CardTitle>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={detail.status} />
              <PayingBadge isPaying={detail.is_paying} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <MetaItem label="User Email" value={detail.user_email || '-'} />
          <MetaItem label="User Type" value={formatUserType(detail.user_type)} />
          <MetaItem label="Created" value={formatDateTime(detail.created_at)} />
          <MetaItem label="Finished" value={formatDateTime(detail.finished_at)} />
          <MetaItem label="Actual Cost" value={formatCredits(detail.actual_cost)} />
          <MetaItem label="Provider Cost" value={formatCredits(detail.total_provider_cost)} />
          <MetaItem label="Workflow ID" value={detail.workflow_id} />
          <MetaItem label="Status" value={detail.status.replace(/_/g, ' ')} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-2xl tracking-wide">Visual Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <MetaItem label="Category" value={category} />
            <MetaItem label="User Type" value={formatUserType(detail.user_type)} />
            <MetaItem label="Plan" value={detail.is_paying ? 'Paying' : 'Free'} />
            <MetaItem label="Complaint" value={detail.feedback ? 'Yes' : 'No'} />
          </div>

          {isCadModel ? (
            <div className="space-y-4">
              {textPrompt && (
                <div className="space-y-2">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Text Prompt (Input)</p>
                  <div className="rounded-md border border-border bg-muted/20 px-4 py-3">
                    <p className="text-sm leading-relaxed">{textPrompt}</p>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">3D Preview (Output)</p>
                {cadGlbUrl ? (
                  // Match the generation-history card size (~1/5 of the panel): a small
                  // fixed box keeps the shared WebGL canvas small so it renders fast,
                  // instead of a full-width canvas that is slow to draw.
                  <div className="w-40">
                    <ScissorGLBGrid>
                      <GLBPreviewSlot
                        id={detail.workflow_id}
                        glbUrl={cadGlbUrl}
                        className="w-full aspect-[4/3] rounded-md border border-border bg-muted/20"
                      />
                    </ScissorGLBGrid>
                  </div>
                ) : (
                  <div className="flex w-40 aspect-[4/3] items-center justify-center rounded-md border border-border bg-muted/20">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground/50">
                      <ImageOff className="h-6 w-6" />
                      <span className="font-mono text-[10px] uppercase tracking-widest text-center">No 3D output</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {visualSummaryImages.map((image) => (
                <ImagePreview key={`${image.label}-${image.url ?? 'missing'}`} url={image.url} label={image.label} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CollapsibleCardSection title="Input Payload">
        <JsonBlock title="Raw JSON" value={detail.input_payload} />
      </CollapsibleCardSection>

      <CollapsibleCardSection title="Processing Steps">
        <div className="space-y-4">
          {detail.steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No processing steps were returned for this workflow.</p>
          ) : (
            detail.steps.map((step, index) => {
              const stepImageUrls = extractImageUrls(step.output)
                .map((value) => normalizeRenderableUrl(value))
                .filter((value): value is string => Boolean(value));
              return (
                <div key={`${step.tool_name}-${index}`} className="rounded-md border border-border">
                  <div className="grid gap-4 border-b border-border px-4 py-4 sm:grid-cols-4">
                    <MetaItem label="Step" value={`${index + 1}. ${step.tool_name}`} />
                    <MetaItem label="Duration" value={formatDuration(step.took_ms)} />
                    <MetaItem label="Timestamp" value={formatDateTime(step.at)} />
                    <MetaItem label="Tool" value={step.tool_name} />
                  </div>
                  <div className="space-y-3 p-4">
                    <JsonBlock title="Input" value={step.input} />
                    <JsonBlock title="Output" value={step.output} />
                    {stepImageUrls.length > 0 && (
                      <div className="grid gap-4 md:grid-cols-2">
                        {stepImageUrls.map((url) => (
                          <ImagePreview key={url} url={url} label="Step Output Image" />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
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
              <p className="text-sm leading-relaxed">{detail.feedback.complaint || '-'}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {(detail.feedback.input_image_urls ?? []).map((url, index) => (
                <ImagePreview key={`${url}-${index}`} url={url} label={`Input Image ${index + 1}`} />
              ))}
              <ImagePreview url={detail.feedback.output_image_url} label="Output Image" />
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
