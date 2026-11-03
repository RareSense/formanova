/**
 * The head tools of contract §2, run in the browser. Each returns what the model
 * gets back; nothing here throws (errors become `{error}`). The page supplies a
 * ToolHost for the screen and call state.
 */
import type { ToolOutput, ToolRunner } from './delegation';
import { createPaymentLink as createPaymentLinkDefault } from './payment-link';
import {
  installmentsOf,
  money,
  panelFromShowArgs,
  plansPanel,
  quotePanel,
  quoteRows,
  type DealInstallment,
  type PanelSpec,
  type UploadPurpose,
} from './panels';
import {
  runNegotiate as runNegotiateDefault,
  runQuote as runQuoteDefault,
  type CallPayment,
  type QuoteRequest,
} from './sales-call-api';

export interface CallView {
  captions?: boolean;
  textSize?: 'normal' | 'large';
  panel?: 'hide' | 'show';
  /** Force the compact layout (fewer rows, no details). */
  compact?: boolean;
}

/** The last quote Ruby priced, saved with the call as a fallback record of the deal. */
export interface LastQuote {
  request: QuoteRequest;
  total: string | null;
  approved: boolean;
}

export interface ToolHost {
  /** Resolves true once the panel is actually on screen, false if it could not be shown. */
  showPanel(panel: PanelSpec): Promise<boolean> | boolean;
  setLastQuote(quote: LastQuote): void;
  clearPanels(): void;
  setView(view: CallView): void;
  updateLead(fields: Record<string, unknown>): void;
  setPayment(payment: CallPayment): void;
  endAfterGoodbye(): void;
  callSessionId(): string | null;
}

export interface ToolApi {
  runQuote(req: QuoteRequest): Promise<Record<string, unknown>>;
  runNegotiate(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  createPaymentLink: typeof createPaymentLinkDefault;
}

const DEFAULT_API: ToolApi = {
  runQuote: runQuoteDefault,
  runNegotiate: runNegotiateDefault,
  createPaymentLink: createPaymentLinkDefault,
};

export const LEAD_FIELDS = [
  'name',
  'brand',
  'email',
  'sells',
  'store_url',
  'shopify',
  'channels',
  'pieces',
  'images',
  'image_types',
  'deadline',
  'budget',
  'project',
  'notes',
  'data_ready',
  'data_sorted',
  'needs_curation',
  'photo_quality_notes',
  'photo_source',
] as const;

const BOOLEAN_LEAD_FIELDS = new Set<string>(['shopify', 'data_sorted', 'needs_curation']);

const PURPOSES: UploadPurpose[] = ['jewelry_photos', 'references', 'cad_files', 'other'];
const PURPOSE_TITLES: Record<UploadPurpose, string> = {
  jewelry_photos: 'Upload your jewellery photos',
  references: 'Upload your references',
  cad_files: 'Share your CAD files',
  other: 'Share your files',
};
const TURNAROUNDS = ['standard', 'priority', 'rush'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? `${fallback} (${e.message})` : fallback);

function quoteRequest(args: Record<string, unknown>): QuoteRequest | { error: string } {
  if (!Array.isArray(args.lines) || !args.lines.length) return { error: 'lines must list at least one {productId, quantity}.' };
  const lines = args.lines.map((l) => ({
    productId: str((l as Record<string, unknown>)?.productId),
    quantity: Number((l as Record<string, unknown>)?.quantity),
  }));
  if (lines.some((l) => !l.productId || !Number.isFinite(l.quantity))) return { error: 'Each line needs productId and quantity.' };
  const turnaround = str(args.turnaround) || 'standard';
  if (!TURNAROUNDS.includes(turnaround)) return { error: 'turnaround must be standard, priority or rush.' };
  let installmentCount: number | undefined;
  if (args.installmentCount !== undefined && args.installmentCount !== null) {
    installmentCount = Number(args.installmentCount);
    if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 4) {
      return { error: 'installmentCount must be a whole number from 1 to 4.' };
    }
  }
  return {
    lines,
    turnaround,
    ...(args.negotiation ? { negotiation: args.negotiation } : {}),
    ...(installmentCount ? { installmentCount } : {}),
  };
}

/** What the model may see of a quote: never the internal costs. */
function modelView(result: Record<string, unknown>): ToolOutput {
  return { approved: result.approved, needs_team_quote: result.needs_team_quote, client: result.client };
}

export function createCallTools(host: ToolHost, api: ToolApi = DEFAULT_API): ToolRunner {
  const tools: Record<string, (args: Record<string, unknown>) => Promise<ToolOutput> | ToolOutput> = {
    show_on_screen: async (args) => {
      const panel = panelFromShowArgs(args);
      if ('error' in panel) return panel;
      // Only claim it once it is really on screen, so Ruby never describes a change that did not happen.
      return (await host.showPanel(panel))
        ? { shown: true, layout: 'compact' }
        : { error: 'The panel could not be shown on screen. Say it out loud instead.' };
    },
    clear_screen: () => {
      host.clearPanels();
      return { cleared: true };
    },
    compare_plans: async () => {
      const { panel, plans } = plansPanel();
      return { shown: await host.showPanel(panel), plans };
    },
    quote_shoot: async (args) => {
      const req = quoteRequest(args);
      if ('error' in req) return req;
      try {
        const result = await api.runQuote(req);
        const client = (result.client ?? {}) as Record<string, unknown>;
        host.setLastQuote({
          request: req,
          total: typeof client.totalCents === 'number' ? money(client.totalCents) : null,
          approved: !!result.approved,
        });
        const shown = await host.showPanel(quotePanel(result));
        return { ...modelView(result), shown };
      } catch (e) {
        return { error: errorText(e, 'The quote could not be made right now.') };
      }
    },
    check_concession: async (args) => {
      try {
        return await api.runNegotiate(args);
      } catch (e) {
        return { error: errorText(e, 'The concession could not be checked right now.') };
      }
    },
    request_upload: (args) => {
      const purpose = PURPOSES.includes(args.purpose as UploadPurpose) ? (args.purpose as UploadPurpose) : 'other';
      host.showPanel({ kind: 'upload', title: str(args.title) || PURPOSE_TITLES[purpose], purpose, note: str(args.note) || undefined });
      return { shown: true };
    },
    request_link: (args) => {
      host.showPanel({ kind: 'link', title: str(args.title) || 'Share a link', note: str(args.note) || undefined });
      return { shown: true };
    },
    update_lead: (args) => {
      const fields: Record<string, unknown> = {};
      for (const key of LEAD_FIELDS) {
        const v = args[key];
        if (BOOLEAN_LEAD_FIELDS.has(key) && typeof v === 'boolean') fields[key] = v;
        else if (v !== undefined && v !== null && String(v).trim()) fields[key] = String(v).trim().slice(0, 2000);
      }
      host.updateLead(fields);
      return { saved: true };
    },
    set_call_view: (args) => {
      const view: CallView = {};
      if (args.captions === 'on' || args.captions === 'off') view.captions = args.captions === 'on';
      if (args.text_size === 'normal' || args.text_size === 'large') view.textSize = args.text_size;
      if (args.panel === 'hide' || args.panel === 'show') view.panel = args.panel;
      if (args.compact === true) view.compact = true;
      host.setView(view);
      return view.compact ? { done: true, layout: 'compact' } : { done: true };
    },
    contact_team: () => {
      host.showPanel({ kind: 'contact', title: 'Talk to the FormaNova team' });
      return { shown: true };
    },
    end_call: () => {
      host.endAfterGoodbye();
      return { ending: true };
    },
    send_payment_link: async (args) => {
      const email = str(args.email);
      if (!EMAIL_RE.test(email)) return { error: 'A valid email is needed for the payment link.' };
      const req = quoteRequest(args);
      if ('error' in req) return req;
      try {
        // Re-price on the server: the total on the link is never taken from the model.
        const result = await api.runQuote(req);
        const client = (result.client ?? {}) as Record<string, unknown>;
        if (!result.approved || typeof client.totalCents !== 'number') {
          return { error: 'This order needs a custom quote, so no payment link can be made.', ...modelView(result) };
        }
        const totalCents = client.totalCents;
        host.setLastQuote({ request: req, total: money(totalCents), approved: true });
        const { rows, total } = quoteRows(client);
        // A single payment is a one-step plan; every payment gets its own link.
        const plan = installmentsOf(client) ?? [
          { n: 1, label: 'Full payment before work starts', amountCents: totalCents, amount: money(totalCents), due: null },
        ];
        const callSessionId = host.callSessionId();
        const links = await Promise.all(
          plan.map((p) => api.createPaymentLink({ callSessionId, email, quote: client, installment: p.n, amountCents: p.amountCents })),
        );
        const installments: DealInstallment[] = plan.map((p, i) => ({ ...p, url: links[i].url }));
        const simulated = links.some((l) => l.simulated);
        const url = installments[0].url;
        host.showPanel({ kind: 'deal', title: 'Your deal', rows, total, url, installments, simulated });
        host.setPayment({ url, total, totalCents, simulated, email, installments });
        host.updateLead({ email, payment_link: url, payment_total: total });
        return { url, total, totalCents, simulated, installments };
      } catch (e) {
        return { error: errorText(e, 'The payment link could not be made right now.') };
      }
    },
  };

  return async (name, args) => {
    const tool = tools[name];
    if (!tool) return { error: `Unknown tool "${name}".` };
    try {
      return await tool(args ?? {});
    } catch (e) {
      return { error: errorText(e, 'The tool failed. Nothing was changed.') };
    }
  };
}
