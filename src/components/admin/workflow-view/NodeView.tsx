import { useState, type ReactNode } from 'react';
import { Box, ExternalLink } from 'lucide-react';

import { ScissorGLBGrid, GLBPreviewSlot } from '@/components/generations/ScissorGLBGrid';
import { isTrustedImageSrc } from '@/lib/admin-workflow-views/url-safety';
import { walkDeeper, type Enhancement, type ViewNode } from '@/lib/admin-workflow-views/walker';
import { FileLink } from './FileLink';
import { ImageGrid } from './ImageThumb';

/**
 * Renders any walked value (walker.ts). Every value node carries data-path so the
 * completeness test can check nothing was dropped. Rendering is bounded: long text is cut
 * with "show all", long lists and objects show a first page with "show more", and nesting
 * past the walker's depth cap opens on demand. Everything is React text; no HTML is injected.
 */

const TEXT_PREVIEW = 2000;
const TEXT_MAX = 200_000;
const CHILD_PAGE = 100;

export interface NodeViewOptions {
  enh?: Enhancement;
  tool?: string;
  fallbackStem: string;
  /** Leave technical values (hashes, keys, base64) out: the page lists them in its Technical section. */
  hideTechnical?: boolean;
}

const Label = ({ children }: { children: ReactNode }) => (
  <p className="break-words font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{children}</p>
);

function TextValue({ value, block }: { value: string; block: boolean }) {
  const [limit, setLimit] = useState(TEXT_PREVIEW);
  const cut = value.length > limit;
  const shown = cut ? value.slice(0, limit) : value;
  return (
    <>
      <span className={block ? 'block whitespace-pre-wrap break-words text-sm leading-relaxed' : 'break-words text-sm'}>{shown}{cut ? '…' : ''}</span>
      {cut && (
        limit < TEXT_MAX ? (
          <button type="button" className="mt-1 block text-xs underline" onClick={() => setLimit(TEXT_MAX)}>
            Show all ({value.length.toLocaleString('en-US')} characters{value.length > TEXT_MAX ? `, first ${TEXT_MAX.toLocaleString('en-US')} shown` : ''})
          </button>
        ) : (
          <span className="mt-1 block text-xs text-muted-foreground">
            {(value.length - TEXT_MAX).toLocaleString('en-US')} more characters are in the raw JSON.
          </span>
        )
      )}
    </>
  );
}

function Model3d({ node, fallbackStem }: { node: Extract<ViewNode, { kind: 'media' }>; fallbackStem: string }) {
  // Same host policy as pictures: the viewer only loads models from the proxy / known storage.
  const trusted = isTrustedImageSrc(node.url);
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2" data-path={node.meta ? undefined : node.path}>
      <Label>{node.label}</Label>
      {!trusted ? null : show ? (
        <div className="w-full max-w-2xl">
          <ScissorGLBGrid>
            <GLBPreviewSlot id={node.path} glbUrl={node.url} className="min-h-[320px] w-full aspect-[4/3] rounded-md border border-border bg-muted/20" forceJewelryPalette />
          </ScissorGLBGrid>
        </div>
      ) : (
        <button type="button" onClick={() => setShow(true)} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/40">
          <Box className="h-4 w-4" /> Show 3D preview
        </button>
      )}
      <FileLink file={{ label: node.label, url: node.url, name: node.name, bytes: node.bytes, ext: node.ext ?? 'glb' }} fallbackStem={fallbackStem} />
    </div>
  );
}

function MetaDetails({ node, opts }: { node: ViewNode | null; opts: NodeViewOptions }) {
  if (!node) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground">Details</summary>
      <div className="mt-2"><NodeView node={node} opts={opts} /></div>
    </details>
  );
}

const isScalar = (n: ViewNode) => n.kind === 'value' || n.kind === 'refused' || (n.kind === 'text' && !n.long)
  || (n.kind === 'media' && n.media === 'link');
const isImage = (n: ViewNode): n is Extract<ViewNode, { kind: 'media' }> => n.kind === 'media' && n.media === 'image';

/** Children of a group or list: scalars in a grid, then pictures, then files, then the rest. */
function Children({ nodes, opts }: { nodes: ViewNode[]; opts: NodeViewOptions }) {
  const [shown, setShown] = useState(CHILD_PAGE);
  const visible = nodes.slice(0, shown);
  const normal = visible.filter((n) => !n.technical);
  const technical = opts.hideTechnical ? [] : visible.filter((n) => n.technical);
  const scalars = normal.filter(isScalar);
  const images = normal.filter(isImage);
  const rest = normal.filter((n) => !isScalar(n) && !isImage(n));
  return (
    <div className="space-y-4">
      {scalars.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {scalars.map((n) => <NodeView key={n.path} node={n} opts={opts} />)}
        </div>
      )}
      {images.length > 0 && <ImageGrid images={images.map((n) => ({ url: n.url, label: n.label, path: n.meta ? undefined : n.path }))} />}
      {images.map((n) => n.meta && <MetaDetails key={`${n.path}-meta`} node={n.meta} opts={opts} />)}
      {rest.map((n) => <NodeView key={n.path} node={n} opts={opts} />)}
      {technical.length > 0 && (
        <details className="rounded-md border border-dashed border-border px-3 py-2">
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Technical ({technical.length})</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {technical.map((n) => <NodeView key={n.path} node={n} opts={opts} />)}
          </div>
        </details>
      )}
      {nodes.length > shown && (
        <button type="button" className="text-xs underline" onClick={() => setShown((s) => s + CHILD_PAGE)}>
          Show {Math.min(CHILD_PAGE, nodes.length - shown)} more of {nodes.length - shown}
        </button>
      )}
    </div>
  );
}

function Deep({ node, opts }: { node: Extract<ViewNode, { kind: 'deep' }>; opts: NodeViewOptions }) {
  const [open, setOpen] = useState(false);
  if (open) return <NodeView node={walkDeeper(node, opts.enh, opts.tool)} opts={opts} />;
  return (
    <div className="space-y-1" data-path={`${node.path}…`}>
      <Label>{node.label}</Label>
      <button type="button" className="text-xs underline" onClick={() => setOpen(true)}>Show deeper levels</button>
    </div>
  );
}

export function NodeView({ node, opts }: { node: ViewNode; opts: NodeViewOptions }) {
  switch (node.kind) {
    case 'value':
      return <div className="min-w-0 space-y-1" data-path={node.path}><Label>{node.label}</Label><span className="text-sm">{node.value}</span></div>;
    case 'text':
      return node.long ? (
        <div className="space-y-2" data-path={node.path}>
          <Label>{node.label}</Label>
          <div className="max-h-96 overflow-y-auto rounded-md border border-border bg-muted/20 px-4 py-3"><TextValue value={node.value} block /></div>
        </div>
      ) : (
        <div className="min-w-0 space-y-1" data-path={node.path}><Label>{node.label}</Label><TextValue value={node.value} block={false} /></div>
      );
    case 'refused':
      return (
        <div className="min-w-0 space-y-1" data-path={node.path}>
          <Label>{node.label}</Label>
          <span className="block break-all font-mono text-xs"><TextValue value={node.value} block={false} /></span>
          <span className="text-[11px] text-amber-600 dark:text-amber-400">Not linked: {node.reason}</span>
        </div>
      );
    case 'media':
      if (node.media === 'image') {
        return (
          <div className="space-y-2">
            <ImageGrid images={[{ url: node.url, label: node.label, path: node.meta ? undefined : node.path }]} />
            <MetaDetails node={node.meta} opts={opts} />
          </div>
        );
      }
      if (node.media === 'model3d') {
        return (
          <div className="space-y-2">
            <Model3d node={node} fallbackStem={opts.fallbackStem} />
            <MetaDetails node={node.meta} opts={opts} />
          </div>
        );
      }
      if (node.media === 'file') {
        return (
          <div className="space-y-1">
            <FileLink file={{ label: node.label, url: node.url, name: node.name, bytes: node.bytes, ext: node.ext }} fallbackStem={opts.fallbackStem} path={node.meta ? undefined : node.path} />
            <MetaDetails node={node.meta} opts={opts} />
          </div>
        );
      }
      return (
        <div className="min-w-0 space-y-1" data-path={node.meta ? undefined : node.path}>
          <Label>{node.label}</Label>
          <a href={node.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 break-all text-sm underline">
            {node.source ?? node.url}<ExternalLink className="h-3 w-3 shrink-0" />
          </a>
          <MetaDetails node={node.meta} opts={opts} />
        </div>
      );
    case 'group':
      return node.label ? (
        <div className="space-y-3 rounded-md border border-border p-3">
          <Label>{node.label}</Label>
          <Children nodes={node.children} opts={opts} />
        </div>
      ) : (
        <Children nodes={node.children} opts={opts} />
      );
    case 'list':
      if (node.gallery) return <div className="space-y-2"><Label>{node.label}</Label><Children nodes={node.items} opts={opts} /></div>;
      return (
        <div className="space-y-3 rounded-md border border-border p-3">
          <Label>{`${node.label} (${node.items.length})`}</Label>
          <Children nodes={node.items} opts={opts} />
        </div>
      );
    case 'deep':
      return <Deep node={node} opts={opts} />;
  }
}
