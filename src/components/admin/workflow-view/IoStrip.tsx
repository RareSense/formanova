import { useState } from 'react';
import { ArrowRight } from 'lucide-react';

import { TILE_PAGE, type IoItem, type IoSummary } from '@/lib/admin-workflow-views/io-summary';
import { ImageThumb } from './ImageThumb';
import { FileTile, ModelTile } from './IoTiles';

/**
 * The run at a glance, right under the run header: [input tiles] -> [output tiles] on one
 * line. It wraps on wider screens; on phones the strip scrolls sideways inside itself, the
 * page does not. The customer's prompt sits right under the input tiles (clamped, with a
 * more toggle); settings, steps and raw JSON are in the collapsed sections below.
 * No data-path here: the completeness contract is about those sections.
 */
function Tile({ item, fallbackStem }: { item: IoItem; fallbackStem: string }) {
  if (item.kind === 'image') return <ImageThumb tile url={item.url} label={item.label} />;
  if (item.kind === 'model3d') return <ModelTile item={item} fallbackStem={fallbackStem} />;
  return <FileTile item={item} fallbackStem={fallbackStem} />;
}

/** Prompts longer than this (or over PROMPT_LINES lines) start clamped, with a "more" toggle. */
const PROMPT_CLAMP_CHARS = 180;
const PROMPT_LINES = 3;

function InputPrompt({ prompt }: { prompt: string }) {
  const [expanded, setExpanded] = useState(false);
  const clampable = prompt.length > PROMPT_CLAMP_CHARS || prompt.split('\n').length > PROMPT_LINES;
  const clamped = clampable && !expanded;
  return (
    <div data-testid="admin-io-prompt" className="w-64 space-y-1 sm:w-auto sm:max-w-md">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Customer prompt</p>
      <p
        data-testid="admin-io-prompt-text"
        className={`whitespace-pre-wrap break-words text-sm leading-relaxed ${clamped ? 'line-clamp-3' : ''}`}
      >
        {prompt}
      </p>
      {clampable && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          {expanded ? 'less' : 'more'}
        </button>
      )}
    </div>
  );
}

function Group({ title, items, fallbackStem, prompt }: {
  title: 'Inputs' | 'Outputs';
  items: IoItem[];
  fallbackStem: string;
  prompt?: string | null;
}) {
  const [limit, setLimit] = useState(TILE_PAGE);
  const id = `admin-io-${title.toLowerCase()}`;
  return (
    <div role="group" aria-labelledby={id} className="shrink-0 space-y-2 sm:shrink">
      <p id={id} className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{title}</p>
      <div className="flex gap-3 sm:flex-wrap">
        {!items.length && (
          <div className="flex h-[120px] w-[120px] items-center justify-center rounded-md border border-dashed border-border p-2 text-center text-[11px] text-muted-foreground">
            No pictures or files
          </div>
        )}
        {items.slice(0, limit).map((item) => <Tile key={item.key} item={item} fallbackStem={fallbackStem} />)}
        {items.length > limit && (
          <button
            type="button"
            onClick={() => setLimit((n) => n + TILE_PAGE)}
            className="flex h-[120px] w-[120px] shrink-0 items-center justify-center rounded-md border border-dashed border-border text-sm hover:bg-muted/40"
          >
            {`+${items.length - limit} more`}
          </button>
        )}
      </div>
      {prompt && <InputPrompt prompt={prompt} />}
    </div>
  );
}

/** `prompt`: the customer's own words, shown under the input tiles (CAD and design-picture runs). */
export function IoStrip({ summary, fallbackStem, prompt = null }: { summary: IoSummary; fallbackStem: string; prompt?: string | null }) {
  return (
    <section aria-labelledby="admin-section-io" className="min-w-0 rounded-lg border border-border bg-card p-4 sm:p-6">
      <h2 id="admin-section-io" className="mb-3 font-display text-2xl font-semibold tracking-wide">Inputs → Outputs</h2>
      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0">
        <div className="flex w-max items-start gap-4 sm:w-auto sm:flex-wrap">
          <Group title="Inputs" items={summary.inputs} fallbackStem={fallbackStem} prompt={prompt} />
          <div className="flex h-[120px] shrink-0 items-center self-start pt-6 text-muted-foreground" aria-hidden>
            <ArrowRight className="h-6 w-6" />
          </div>
          <Group title="Outputs" items={summary.outputs} fallbackStem={fallbackStem} />
        </div>
      </div>
    </section>
  );
}
