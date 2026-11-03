import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Mail, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TEAM_EMAIL, amountColumn, type DealInstallment, type Installment, type Panel } from '@/lib/ruby-call/panels';
import { LinkField, UploadCard, type UploadOutcome } from './RubyPanelInputs';

interface RubyStageProps {
  /** The one panel on screen (newest replaces the previous). */
  panel: Panel;
  /** Fewer rows, no details: set by the caller or Ruby (set_call_view compact). */
  compact?: boolean;
  onClose(panel: Panel): void;
  /** Fired once the panel is on screen, so Ruby only claims what the caller can see. */
  onRendered?(id: string): void;
  onUpload(panel: Panel, files: File[]): Promise<UploadOutcome[]>;
  onLink(url: string): void;
  onLinkTyping(): void;
}

const KICKER = 'font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground';
const GOLD = 'hsl(var(--formanova-hero-accent))';
const ROWS_SHOWN = 6;
const ROWS_SHOWN_COMPACT = 4;

/**
 * Ruby's stage (like Eva's): one calm card at a time, never scrolling sideways.
 * Rows are compact: label left, amount right, details wrapped under the label.
 */
export function RubyStage({ panel, compact = false, onClose, onRendered, onUpload, onLink, onLinkTyping }: RubyStageProps) {
  useEffect(() => {
    onRendered?.(panel.id);
  }, [panel.id, onRendered]);

  return (
    <section
      key={panel.id}
      aria-label={panel.title}
      className="relative w-full min-w-0 animate-fade-in border-2 border-border bg-card p-4 text-left sm:p-6"
    >
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-8 w-8"
        aria-label={`Close ${panel.title}`}
        onClick={() => onClose(panel)}
      >
        <X className="h-4 w-4" />
      </Button>
      {'kicker' in panel && panel.kicker && <p className={`${KICKER} pr-8`}>{panel.kicker}</p>}
      {panel.kind === 'deal' && <p className={KICKER}>Ready to pay</p>}
      <h3 className="mt-1 break-words pr-8 font-display text-2xl uppercase leading-none tracking-wide sm:text-3xl">
        {panel.title}
      </h3>
      <div className="mt-4 min-w-0">
        <PanelBody panel={panel} compact={compact} onUpload={onUpload} onLink={onLink} onLinkTyping={onLinkTyping} />
      </div>
    </section>
  );
}

function PanelBody({
  panel,
  compact,
  onUpload,
  onLink,
  onLinkTyping,
}: {
  panel: Panel;
  compact: boolean;
  onUpload: RubyStageProps['onUpload'];
  onLink: RubyStageProps['onLink'];
  onLinkTyping: RubyStageProps['onLinkTyping'];
}) {
  switch (panel.kind) {
    case 'table':
      return (
        <>
          <Rows columns={panel.columns} rows={panel.rows} highlight={panel.highlight} total={panel.total} compact={compact} />
          {panel.delivery && <p className="mt-3 break-words text-sm">{panel.delivery}</p>}
          {panel.schedule && <Schedule plan={panel.schedule} />}
          {panel.note && !compact && <Note text={panel.note} />}
        </>
      );
    case 'list':
      return (
        <>
          <Rows columns={['Item']} rows={panel.items.map((i) => [i])} compact={compact} />
          {panel.note && !compact && <Note text={panel.note} />}
        </>
      );
    case 'upload':
      return (
        <UploadCard
          purpose={panel.purpose}
          note={panel.note}
          onUpload={(files) => onUpload(panel, files)}
          onLink={onLink}
          onLinkTyping={onLinkTyping}
        />
      );
    case 'link':
      return (
        <>
          {panel.note && <p className="mb-3 break-words text-sm text-muted-foreground">{panel.note}</p>}
          <LinkField onLink={onLink} onTyping={onLinkTyping} />
        </>
      );
    case 'contact':
      return (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Write to the FormaNova team and they will get back to you.</p>
          <p className="break-all font-mono text-sm">{TEAM_EMAIL}</p>
          <Button asChild size="lg" className="h-12 w-full px-6 sm:w-auto">
            <a href={`mailto:${TEAM_EMAIL}`}>
              <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
              Email the team
            </a>
          </Button>
        </div>
      );
    case 'deal':
      return <Deal panel={panel} compact={compact} />;
  }
}

function Note({ text }: { text: string }) {
  return <p className="mt-3 break-words text-xs leading-relaxed text-muted-foreground">{text}</p>;
}

/** One compact row per line: label left, amount right, the other columns wrapped under the label. */
function Rows({
  columns,
  rows,
  highlight,
  total,
  compact,
}: {
  columns: string[];
  rows: string[][];
  highlight?: number;
  total?: string;
  compact: boolean;
}) {
  const [open, setOpen] = useState(false);
  const limit = compact ? ROWS_SHOWN_COMPACT : ROWS_SHOWN;
  const amountAt = amountColumn(columns, rows);
  // The recommended row always stays in view.
  const order = rows.map((_, i) => i);
  const visible = open ? order : order.filter((i) => i < limit || i === highlight).slice(0, limit + 1);
  const hidden = rows.length - visible.length;

  return (
    <div className="min-w-0">
      <ul className="divide-y divide-border/60">
        {visible.map((r) => {
          const row = rows[r];
          const picked = r === highlight;
          const details = compact
            ? ''
            : row
                .map((v, i) => (i === 0 || i === amountAt || !v ? '' : `${columns[i]} ${v}`))
                .filter(Boolean)
                .join(' · ');
          return (
            <li
              key={r}
              className="flex min-w-0 items-start gap-3 py-2.5 pl-3"
              style={{
                borderLeft: `2px solid ${picked ? GOLD : 'transparent'}`,
                background: picked ? 'hsl(var(--formanova-hero-accent) / 0.08)' : undefined,
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm leading-snug">
                  {row[0]}
                  {picked && (
                    <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.15em]" style={{ color: GOLD }}>
                      Recommended
                    </span>
                  )}
                </p>
                {details && <p className="mt-0.5 break-words text-xs text-muted-foreground">{details}</p>}
              </div>
              {amountAt !== null && (
                <span className="max-w-[45%] shrink-0 break-words text-right text-sm tabular-nums">{row[amountAt]}</span>
              )}
            </li>
          );
        })}
      </ul>
      {(hidden > 0 || open) && rows.length > limit && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 px-3 font-mono text-[10px] uppercase tracking-[0.2em]"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Show fewer' : `${hidden} more item${hidden === 1 ? '' : 's'}`}
        </Button>
      )}
      {total && (
        <div className="mt-2 flex min-w-0 items-baseline justify-between gap-3 border-t-2 border-border pt-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em]">Total</span>
          <span className="break-words text-right font-display text-2xl leading-none tabular-nums" style={{ color: GOLD }}>
            {total}
          </span>
        </div>
      )}
    </div>
  );
}

/** The payment plan under a quote: what is paid, how much, and when. */
function Schedule({ plan }: { plan: Installment[] }) {
  return (
    <div className="mt-4">
      <p className={KICKER}>Payment plan</p>
      <ol className="mt-2 space-y-2">
        {plan.map((p) => (
          <li key={p.n} className="flex min-w-0 items-baseline gap-3 border-l-2 pl-3 text-sm" style={{ borderColor: GOLD }}>
            <span className="min-w-0 flex-1 break-words">
              {p.label}
              {p.due && <span className="block text-xs text-muted-foreground">{p.due}</span>}
            </span>
            <span className="shrink-0 tabular-nums">{p.amount}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function CopyLinkButton({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the link is still on the Pay button */
    }
  };
  return (
    <Button variant="outline" size="lg" className="h-12 w-full px-4" aria-label={label} onClick={() => void copy()}>
      {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
      {copied ? 'Copied' : 'Copy link'}
    </Button>
  );
}

function Deal({ panel, compact }: { panel: Extract<Panel, { kind: 'deal' }>; compact: boolean }) {
  const plan: DealInstallment[] = panel.installments?.length
    ? panel.installments
    : [{ n: 1, label: 'Full payment', amountCents: 0, amount: panel.total, due: null, url: panel.url }];
  return (
    <div className="space-y-4">
      {panel.simulated && (
        <span className="inline-block border border-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
          Test link
        </span>
      )}
      <Rows columns={['Item', 'Qty', 'Per unit', 'Total']} rows={panel.rows} total={panel.total} compact={compact} />
      <p className={KICKER}>{plan.length > 1 ? 'Payment plan' : 'Payment'}</p>
      <ol className="space-y-4">
        {plan.map((p) => (
          <li key={p.n} className="space-y-3 border-l-2 pl-3" style={{ borderColor: GOLD }}>
            <div className="flex min-w-0 items-baseline gap-3 text-sm">
              <span className="min-w-0 flex-1 break-words">
                {p.label}
                {p.due && <span className="block text-xs text-muted-foreground">{p.due}</span>}
              </span>
              <span className="shrink-0 font-display text-xl leading-none tabular-nums">{p.amount}</span>
            </div>
            <div className={`grid grid-cols-1 gap-3 ${p.n === 1 ? 'sm:grid-cols-2' : ''}`}>
              {p.n === 1 && (
                <Button asChild size="lg" className="h-12 w-full px-4">
                  <a href={p.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                    Pay now
                  </a>
                </Button>
              )}
              <CopyLinkButton url={p.url} label={`Copy link for payment ${p.n}`} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
