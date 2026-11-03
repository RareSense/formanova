import { useState } from 'react';
import { Check, Copy, ExternalLink, Mail, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TEAM_EMAIL, type Installment, type Panel } from '@/lib/ruby-call/panels';
import { LinkField, UploadCard, type UploadOutcome } from './RubyPanelInputs';

interface RubyPanelsProps {
  panels: Panel[];
  onClose(panel: Panel): void;
  onUpload(panel: Panel, files: File[]): Promise<UploadOutcome[]>;
  onLink(url: string): void;
  onLinkTyping(): void;
}

const KICKER = 'font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground';
const GOLD = 'hsl(var(--formanova-hero-accent))';

/** What Ruby shows during a call, newest first, in FormaNova card style. */
export function RubyPanels({ panels, onClose, onUpload, onLink, onLinkTyping }: RubyPanelsProps) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-4" aria-label="Shown by Ruby" aria-live="polite">
      {panels.map((panel) => (
        <section
          key={panel.id}
          aria-label={panel.title}
          className="relative w-full min-w-0 animate-fade-in border-2 border-border bg-card p-4 text-left sm:p-5"
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
          {'kicker' in panel && panel.kicker && <p className={KICKER}>{panel.kicker}</p>}
          {panel.kind === 'deal' && <p className={KICKER}>Ready to pay</p>}
          <h3 className="mt-1 break-words pr-8 font-display text-2xl uppercase leading-none tracking-wide sm:text-3xl">
            {panel.title}
          </h3>
          <div className="mt-4">
            <PanelBody panel={panel} onUpload={onUpload} onLink={onLink} onLinkTyping={onLinkTyping} />
          </div>
        </section>
      ))}
    </div>
  );
}

function PanelBody({
  panel,
  onUpload,
  onLink,
  onLinkTyping,
}: {
  panel: Panel;
  onUpload: RubyPanelsProps['onUpload'];
  onLink: RubyPanelsProps['onLink'];
  onLinkTyping: RubyPanelsProps['onLinkTyping'];
}) {
  switch (panel.kind) {
    case 'table':
      return (
        <>
          <Table columns={panel.columns} rows={panel.rows} highlight={panel.highlight} total={panel.total} />
          {panel.note && <Note text={panel.note} />}
          {panel.schedule && <Schedule plan={panel.schedule} />}
        </>
      );
    case 'list':
      return (
        <>
          <ul className="space-y-2">
            {panel.items.map((item, i) => (
              <li key={i} className="flex gap-3 border-l-2 pl-3 text-sm" style={{ borderColor: GOLD }}>
                <span className="min-w-0 break-words">{item}</span>
              </li>
            ))}
          </ul>
          {panel.note && <Note text={panel.note} />}
        </>
      );
    case 'upload':
      return (
        <>
          {panel.note && <p className="mb-3 text-justify text-sm text-muted-foreground">{panel.note}</p>}
          <UploadCard
            purpose={panel.purpose}
            onUpload={(files) => onUpload(panel, files)}
            onLink={onLink}
            onLinkTyping={onLinkTyping}
          />
        </>
      );
    case 'link':
      return (
        <>
          {panel.note && <p className="mb-3 text-justify text-sm text-muted-foreground">{panel.note}</p>}
          <LinkField onLink={onLink} onTyping={onLinkTyping} />
        </>
      );
    case 'contact':
      return (
        <div className="space-y-3">
          <p className="text-justify text-sm text-muted-foreground">
            Write to the FormaNova team and they will get back to you.
          </p>
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
      return <Deal panel={panel} />;
  }
}

function Note({ text }: { text: string }) {
  return <p className="mt-3 text-justify text-xs leading-relaxed text-muted-foreground">{text}</p>;
}

function Table({
  columns,
  rows,
  highlight,
  total,
}: {
  columns: string[];
  rows: string[][];
  highlight?: number;
  total?: string;
}) {
  return (
    // Wide tables scroll inside the card; the page never scrolls sideways.
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-border">
            {columns.map((c, i) => (
              <th
                key={i}
                scope="col"
                className={`py-2 pr-4 font-mono text-[10px] font-normal uppercase tracking-[0.2em] text-muted-foreground last:pr-0 ${
                  i === 0 ? 'text-left' : 'text-right'
                }`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => {
            const picked = r === highlight;
            return (
              <tr
                key={r}
                className="border-b border-border/60"
                style={picked ? { background: 'hsl(var(--formanova-hero-accent) / 0.12)' } : undefined}
              >
                {row.map((v, i) => (
                  <td key={i} className={`py-2 pr-4 last:pr-0 ${i === 0 ? 'text-left' : 'text-right tabular-nums'}`}>
                    {v}
                    {i === 0 && picked && (
                      <span
                        className="ml-2 whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.15em]"
                        style={{ color: GOLD }}
                      >
                        Recommended
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
        {total && (
          <tfoot>
            <tr>
              <td colSpan={Math.max(1, columns.length - 1)} className="pt-3 font-mono text-[10px] uppercase tracking-[0.2em]">
                Total
              </td>
              <td className="pt-3 text-right font-display text-2xl leading-none tabular-nums" style={{ color: GOLD }}>
                {total}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
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

function Deal({ panel }: { panel: Extract<Panel, { kind: 'deal' }> }) {
  const plan = panel.installments?.length
    ? panel.installments
    : [{ n: 1, label: 'Full payment', amountCents: 0, amount: panel.total, due: null, url: panel.url }];
  return (
    <div className="space-y-4">
      {panel.simulated && (
        <span className="inline-block border border-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
          Test link
        </span>
      )}
      <Table columns={['Item', 'Qty', 'Per unit', 'Total']} rows={panel.rows} total={panel.total} />
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
