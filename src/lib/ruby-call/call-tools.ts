/**
 * The head tools of contract §2, run in the browser. Each returns what the model
 * gets back; nothing here throws (errors become `{error}`). The page supplies a
 * ToolHost for the screen and call state.
 */
import type { ToolOutput, ToolRunner } from './delegation';
import { createPaymentLink as createPaymentLinkDefault } from './payment-link';
import { panelFromShowArgs, plansPanel, quotePanel, quoteRows, type PanelSpec, type UploadPurpose } from './panels';
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
}

export interface ToolHost {
  showPanel(panel: PanelSpec): void;
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
] as const;

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
  return { lines, turnaround, ...(args.negotiation ? { negotiation: args.negotiation } : {}) };
}

/** What the model may see of a quote: never the internal costs. */
function modelView(result: Record<string, unknown>): ToolOutput {
  return { approved: result.approved, needs_team_quote: result.needs_team_quote, client: result.client };
}

export function createCallTools(host: ToolHost, api: ToolApi = DEFAULT_API): ToolRunner {
  const tools: Record<string, (args: Record<string, unknown>) => Promise<ToolOutput> | ToolOutput> = {
    show_on_screen: (args) => {
      const panel = panelFromShowArgs(args);
      if ('error' in panel) return panel;
      host.showPanel(panel);
      return { shown: true };
    },
    clear_screen: () => {
      host.clearPanels();
      return { cleared: true };
    },
    compare_plans: () => {
      const { panel, plans } = plansPanel();
      host.showPanel(panel);
      return { shown: true, plans };
    },
    quote_shoot: async (args) => {
      const req = quoteRequest(args);
      if ('error' in req) return req;
      try {
        const result = await api.runQuote(req);
        host.showPanel(quotePanel(result));
        return modelView(result);
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
        if (key === 'shopify' && typeof v === 'boolean') fields[key] = v;
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
      host.setView(view);
      return { done: true };
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
          return { error: 'This order needs a quote from the team, so no payment link can be made.', ...modelView(result) };
        }
        const { rows, total } = quoteRows(client);
        const link = await api.createPaymentLink({ callSessionId: host.callSessionId(), email, quote: client });
        host.showPanel({ kind: 'deal', title: 'Your deal', rows, total, url: link.url, simulated: link.simulated });
        host.setPayment({ url: link.url, total, simulated: link.simulated, email });
        host.updateLead({ email, payment_link: link.url, payment_total: total });
        return { url: link.url, total, simulated: link.simulated };
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
