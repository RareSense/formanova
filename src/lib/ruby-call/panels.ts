/**
 * What Ruby can put on screen during a call, and how tool results become panels.
 * Pure data; RubyPanels.tsx renders it.
 */
import { CREDIT_PLANS } from '@/lib/credit-plans';

export type UploadPurpose = 'jewelry_photos' | 'references' | 'cad_files' | 'other';

/** One payment of a plan (sales_price_quote `client.installments`). */
export interface Installment {
  n: number;
  label: string;
  amountCents: number;
  amount: string;
  due: string | null;
}

/** `url` is null for later payments: their link is made when that part is delivered. */
export type DealInstallment = Installment & { url: string | null };

export type PanelSpec =
  | {
      kind: 'table';
      title: string;
      kicker?: string;
      columns: string[];
      rows: string[][];
      highlight?: number;
      total?: string;
      note?: string;
      /** Payment plan shown under a quote. */
      schedule?: Installment[];
      /** "Delivery: within 5 days, usually faster" (kept in compact mode too). */
      delivery?: string;
    }
  | { kind: 'list'; title: string; kicker?: string; items: string[]; note?: string }
  | { kind: 'upload'; title: string; purpose: UploadPurpose; note?: string }
  | { kind: 'link'; title: string; note?: string }
  | { kind: 'contact'; title: string }
  | {
      kind: 'deal';
      title: string;
      rows: string[][];
      total: string;
      /** The first payment's link (Pay now). */
      url: string;
      installments: DealInstallment[];
      simulated: boolean;
    };

export type Panel = PanelSpec & { id: string };

export const TEAM_EMAIL = 'studio@formanova.ai';
const MAX_ROWS = 30;
const MAX_COLUMNS = 6;
const MAX_CELL = 200;

const cell = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).slice(0, MAX_CELL);
const text = (v: unknown, fallback = ''): string => (typeof v === 'string' && v.trim() ? v.trim().slice(0, MAX_CELL) : fallback);

/** Validates show_on_screen args; returns the panel or an error for the model. */
export function panelFromShowArgs(args: Record<string, unknown>): PanelSpec | { error: string } {
  const title = text(args.title);
  if (!title) return { error: 'A title is needed.' };
  const kicker = text(args.kicker) || undefined;
  const note = text(args.note) || undefined;
  if (args.kind === 'table') {
    if (!Array.isArray(args.columns) || !args.columns.length) return { error: 'A table needs columns.' };
    if (!Array.isArray(args.rows) || !args.rows.length) return { error: 'A table needs rows.' };
    // Rows are shown compact (label left, amount right, the rest under the label): wider will not fit.
    if (args.columns.length > MAX_COLUMNS) return { error: `Too wide to fit: use at most ${MAX_COLUMNS} columns.` };
    if (args.rows.length > MAX_ROWS) return { error: `Too long to fit: use at most ${MAX_ROWS} rows.` };
    const columns = args.columns.slice(0, MAX_COLUMNS).map(cell);
    const rows = args.rows
      .slice(0, MAX_ROWS)
      .map((r) => columns.map((_, i) => cell(Array.isArray(r) ? r[i] : i === 0 ? r : '')));
    const highlight =
      typeof args.highlight === 'number' && Number.isInteger(args.highlight) && args.highlight >= 0 && args.highlight < rows.length
        ? args.highlight
        : undefined;
    return { kind: 'table', title, kicker, columns, rows, highlight, total: text(args.total) || undefined, note };
  }
  if (args.kind === 'list') {
    if (!Array.isArray(args.items) || !args.items.length) return { error: 'A list needs items.' };
    if (args.items.length > MAX_ROWS) return { error: `Too long to fit: use at most ${MAX_ROWS} items.` };
    return { kind: 'list', title, kicker, items: args.items.slice(0, MAX_ROWS).map(cell), note };
  }
  return { error: 'kind must be "table" or "list".' };
}

export function money(cents: unknown): string {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '';
  const dollars = cents / 100;
  const whole = Number.isInteger(dollars);
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

const percent = (share: unknown) => (typeof share === 'number' && share > 0 ? `${Math.round(share * 1000) / 10}%` : '');

export function teamContactText(contact: unknown): string {
  if (typeof contact === 'string' && contact.trim()) return contact.trim();
  if (contact && typeof contact === 'object') {
    const c = contact as Record<string, unknown>;
    return text(c.email) || text(c.name) || TEAM_EMAIL;
  }
  return TEAM_EMAIL;
}

interface QuoteLine {
  kind?: string;
  label?: string;
  quantity?: number;
  needsTeamQuote?: boolean;
  unitPriceCents?: number | null;
  lineTotalCents?: number | null;
}

/** Client-facing wording: fixes are made by an expert AI creative editor. */
export function clientWording(text: string): string {
  return text
    .replace(/\bhuman fix(es)?\b/gi, (_m, plural) => (plural ? 'fixes by an expert AI creative editor' : 'fix by an expert AI creative editor'))
    .replace(/\b(a )?quote from (our|the) team\b/gi, 'a custom quote');
}

const CUSTOM_QUOTE = 'Custom quote';

/** The payment plan in a client quote view; null when there is none. */
export function installmentsOf(client: Record<string, unknown>): Installment[] | null {
  if (!Array.isArray(client.installments) || !client.installments.length) return null;
  const plan = (client.installments as Record<string, unknown>[])
    .map((i, idx) => {
      const cents = typeof i?.amountCents === 'number' ? i.amountCents : typeof i?.amount_cents === 'number' ? i.amount_cents : null;
      if (cents === null) return null;
      return {
        n: idx + 1,
        label: clientWording(text(i.label, `Payment ${idx + 1}`)),
        amountCents: cents as number,
        amount: money(cents),
        due: text(i.due) || null,
      };
    })
    .filter((i): i is Installment => !!i);
  return plan.length ? plan : null;
}

/** Rows and total of a client quote view (sales_price_quote `client`). */
export function quoteRows(client: Record<string, unknown>): { rows: string[][]; total: string } {
  const lines = Array.isArray(client.lines) ? (client.lines as QuoteLine[]) : [];
  const rows = lines.map((l) => {
    // Bonus lines (AI revision rounds, coverage, fixes) are free extras of the order.
    const bonus = l.kind === 'allowance' && !l.lineTotalCents;
    return [
      clientWording(cell(l.label)),
      l.quantity ? String(l.quantity) : '',
      l.needsTeamQuote ? CUSTOM_QUOTE : bonus ? 'Bonus' : money(l.unitPriceCents),
      l.needsTeamQuote ? CUSTOM_QUOTE : bonus ? 'Free' : money(l.lineTotalCents),
    ];
  });
  if (percent(client.surchargeShare)) {
    rows.push([`Turnaround: ${text(client.turnaroundLabel, cell(client.turnaround))}`, '', `+${percent(client.surchargeShare)}`, '']);
  }
  if (percent(client.discountShare)) rows.push(['Discount', '', `-${percent(client.discountShare)}`, '']);
  const total = typeof client.totalCents === 'number' ? money(client.totalCents) : CUSTOM_QUOTE;
  return { rows, total };
}

/** The panel for a ruby_quote result `{approved, needs_team_quote, client}`. */
export function quotePanel(result: Record<string, unknown>): PanelSpec {
  const client = (result.client && typeof result.client === 'object' ? result.client : {}) as Record<string, unknown>;
  if (!result.approved || !Array.isArray(client.lines)) {
    return {
      kind: 'list',
      title: 'Your quote',
      kicker: 'Quote',
      items: [clientWording(text(client.message, 'This order needs a custom quote')), `Contact: ${teamContactText(client.teamContact)}`],
    };
  }
  const { rows, total } = quoteRows(client);
  const notes = [
    client.partial ? 'Some items need a custom quote.' : '',
    client.forcesFullUpfront ? 'Paid in full upfront.' : '',
  ].filter(Boolean);
  return {
    kind: 'table',
    title: 'Your quote',
    kicker: text(client.turnaroundLabel, 'Quote'),
    columns: ['Item', 'Qty', 'Per unit', 'Total'],
    rows,
    total,
    note: notes.join(' ') || undefined,
    ...(installmentsOf(client) ? { schedule: installmentsOf(client) as Installment[] } : {}),
    ...(text(client.deliveryWithin) ? { delivery: `Delivery: within ${text(client.deliveryWithin)}, usually faster` } : {}),
  };
}

/** FormaNova's self-serve credit plans, from the app's own plan data. */
export function plansPanel(): { panel: PanelSpec; plans: Record<string, unknown>[] } {
  const plans = CREDIT_PLANS.map((p) => ({
    name: p.name,
    price_usd: p.price,
    credits: p.credits,
    up_to_photos: p.photos,
    up_to_cad_runs: p.cads,
  }));
  return {
    plans,
    panel: {
      kind: 'table',
      title: 'Self-serve credit plans',
      kicker: 'Plans',
      columns: ['Plan', 'Price', 'Credits', 'Photos', 'CAD runs'],
      rows: CREDIT_PLANS.map((p) => [p.name, `$${p.price}`, String(p.credits), `Up to ${p.photos}`, `Up to ${p.cads}`]),
    },
  };
}

const MONEY = /\$\s?\d|₹\s?\d|\d+%/;

/** The column that carries the amount: the last one with money in it, else the last one. */
export function amountColumn(columns: string[], rows: string[][]): number | null {
  if (columns.length < 2) return null;
  for (let c = columns.length - 1; c > 0; c--) if (rows.some((r) => MONEY.test(r[c] ?? ''))) return c;
  return columns.length - 1;
}
