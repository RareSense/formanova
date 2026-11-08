/**
 * The head tools of contract §2, run in the browser. Each returns what the model
 * gets back; nothing here throws (errors become `{error}`). The page supplies a
 * ToolHost for the screen and call state.
 */
import { isReachChannel, reachField } from './reach-contact';
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
import { trackRubyPaymentLinkCreated, trackRubyQuoteShown, trackRubyTeamContactShown } from '@/lib/posthog-events';

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
  /** Checks a real link for the payment while the call is live; calls back once when it is paid. */
  watchPayment?(linkId: string, onPaid: (paidAt: string | null) => void): void;
  /** A price was put on screen (for the call's analytics summary). */
  quoteShown?(): void;
  /** The email the caller is logged in with. The payment link always uses it, so Ruby never asks (owner, 2026-11-06). */
  accountEmail?(): string | null;
}

/** Owner, 2026-11-08: the whole plan, said when the link is on screen, before they pay. */
export const SAY_WITH_LINK =
  "Tell Ruby to say this now, in her own words, all of it: the link is on their screen and they can pay now or later; paying starts their project. " +
  'Then we need their photos and a short brief (which pieces, the look, sizes, background). They can do that right now on this call, ' +
  "or, if they pay later, just come back to this page and give her a call again: she'll remember their order and they'll do the photos and brief together.";

/** Owner, 2026-11-08: said the first time they send photos, so curation is never a surprise. */
export const SAY_ON_DATA =
  'Tell Ruby to say this now, in her own words, short: "Are your photos already sorted, with one folder per product, named by product, and only your best sharp, well-lit photos? ' +
  "If they need curation, just let us know: that is a separate cost, because people on our team look through your files, pick the best images and sort them before they go to the AI. " +
  'Or you can sort them yourself for free, whichever you prefer. Either way, if our team needs anything, they will contact you."';

/** Said before the goodbye while the link is unpaid. */
export const SAY_BEFORE_GOODBYE =
  'Not ended yet: their payment link is not paid. First tell Ruby to say, in two short sentences: whenever they are ready, pay with the link on their screen; ' +
  "then just come back to this page and give her a call again, and they'll do the photos and brief together (anything already uploaded stays with their order). " +
  'Then her goodbye, then call end_call again.';

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
  'resolution',
  'aspect_ratios',
  'style',
  'references',
  'photos_link',
  'models_source',
  'model_looks',
] as const;

/** Unknown fields are kept too (the service may add more), within safe limits. */
const LEAD_KEY = /^[a-z][a-z0-9_]{0,39}$/;
const MAX_LEAD_KEYS = 60;


const PURPOSES: UploadPurpose[] = ['jewelry_photos', 'references', 'cad_files', 'other'];
const PURPOSE_TITLES: Record<UploadPurpose, string> = {
  jewelry_photos: 'Upload your jewelry photos',
  references: 'Upload images you like',
  cad_files: 'Share your CAD files',
  other: 'Share your files',
};
const TURNAROUNDS = ['standard', 'express'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const TITLE_MAX = 40;
const NOTE_MAX = 120;
/** Cuts text at a word so a card heading or note never runs off the card. */
export const clip = (text: string, max: number) => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
};
const title = (v: unknown, fallback: string) => clip(str(v) || fallback, TITLE_MAX);
const note = (v: unknown) => (str(v) ? clip(str(v), NOTE_MAX) : undefined);
const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? `${fallback} (${e.message})` : fallback);

function quoteRequest(args: Record<string, unknown>): QuoteRequest | { error: string } {
  if (!Array.isArray(args.lines) || !args.lines.length) return { error: 'lines must list at least one {productId, quantity}.' };
  const lines = args.lines.map((l) => ({
    productId: str((l as Record<string, unknown>)?.productId),
    quantity: Number((l as Record<string, unknown>)?.quantity),
  }));
  if (lines.some((l) => !l.productId || !Number.isFinite(l.quantity))) return { error: 'Each line needs productId and quantity.' };
  const turnaround = str(args.turnaround) || 'standard';
  if (!TURNAROUNDS.includes(turnaround)) return { error: 'turnaround must be standard or express.' };
  let installmentCount: number | undefined;
  if (args.installmentCount !== undefined && args.installmentCount !== null) {
    installmentCount = Number(args.installmentCount);
    if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 3) {
      return { error: 'installmentCount must be a whole number from 1 to 3.' };
    }
  }
  return {
    lines,
    turnaround,
    ...(args.negotiation ? { negotiation: args.negotiation } : {}),
    ...(installmentCount ? { installmentCount } : {}),
  };
}

/** Sizes on a quote, from the product ids ("ecommerce-2k" gives "2k"), in a fixed order. */
const SIZE_ORDER = ['1k', '2k', '4k', '8k', '12k'];
function quoteSizes(req: QuoteRequest): string {
  const found = new Set(req.lines.map((l) => /-(\d+k)$/.exec(l.productId)?.[1]).filter((s): s is string => !!s));
  return SIZE_ORDER.filter((s) => found.has(s)).join(',');
}

/** What the model may see of a quote: never the internal costs. */
function modelView(result: Record<string, unknown>): ToolOutput {
  return {
    approved: result.approved,
    needs_team_quote: result.needs_team_quote,
    client: result.client,
    // Under the normal lowest: Ruby says it once as her final price, then hands over to the team.
    ...(result.last_offer === true ? { last_offer: true } : {}),
  };
}

export function createCallTools(host: ToolHost, api: ToolApi = DEFAULT_API): ToolRunner {
  // The real link still open on this call, so a changed order cancels it before a new one is made.
  let openLink: { linkId: string; deal: string } | null = null;
  let unpaidLink = false;
  let curationSaid = false;
  // The first time they send their photos, Ruby makes curation clear (owner, 2026-11-08).
  const curationOnce = () => {
    if (curationSaid) return { shown: true };
    curationSaid = true;
    return { shown: true, say_next: SAY_ON_DATA };
  };
  let nextStepsSaid = false;
  let quotesShown = 0;
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
        quotesShown += 1;
        host.quoteShown?.();
        trackRubyQuoteShown({
          approved: !!result.approved,
          total_cents: typeof client.totalCents === 'number' ? client.totalCents : null,
          image_count: req.lines.reduce((sum, l) => sum + l.quantity, 0),
          sizes: quoteSizes(req),
          turnaround: req.turnaround ?? 'standard',
          installments: installmentsOf(client)?.length ?? 1,
          last_offer: result.last_offer === true,
          quote_number: quotesShown,
        });
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
      host.showPanel({ kind: 'upload', title: title(args.title, PURPOSE_TITLES[purpose]), purpose, note: note(args.note) });
      return purpose === 'jewelry_photos' ? curationOnce() : { shown: true };
    },
    request_link: (args) => {
      host.showPanel({ kind: 'link', title: title(args.title, 'Share a link'), note: note(args.note) });
      return curationOnce();
    },
    request_brief: async (args) =>
      (await host.showPanel({ kind: 'brief', title: title(args.title, 'Your brief'), note: note(args.note) }))
        ? { shown: true }
        : { error: 'The box could not be shown. Ask them to tell you instead.' },
    request_contact: async (args) => {
      if (!isReachChannel(args.channel)) return { error: 'Use one of: WhatsApp, iMessage, text message, Instagram or email.' };
      const channel = args.channel;
      return (await host.showPanel({ kind: 'reach', title: `Your ${reachField(channel).name}`, channel }))
        ? { shown: true }
        : { error: 'The field could not be shown. Ask them to say it and read it back.' };
    },
    update_lead: (args) => {
      const fields: Record<string, unknown> = {};
      for (const [key, v] of Object.entries(args).slice(0, MAX_LEAD_KEYS)) {
        if (!LEAD_KEY.test(key) || v === undefined || v === null) continue;
        if (typeof v === 'boolean') fields[key] = v;
        else if (typeof v === 'string' || typeof v === 'number') {
          const text = String(v).trim().slice(0, 2000);
          if (text) fields[key] = text;
        } else if (Array.isArray(v)) {
          const text = v.filter((x) => typeof x === 'string' || typeof x === 'number').join(', ').slice(0, 2000);
          if (text) fields[key] = text;
        }
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
      trackRubyTeamContactShown();
      return { shown: true };
    },
    end_call: () => {
      // Owner, 2026-11-08: a caller left with an unpaid link and no idea what came next. Held once, so Ruby says it.
      if (unpaidLink && !nextStepsSaid) {
        nextStepsSaid = true;
        return { ending: false, say_first: SAY_BEFORE_GOODBYE };
      }
      host.endAfterGoodbye();
      return { ending: true };
    },
    send_payment_link: async (args) => {
      // The logged-in email wins; what the model passed is only a fallback for a page without one.
      const email = host.accountEmail?.() || str(args.email);
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
        // A single payment is a one-step plan. Only the first payment gets a link on the call;
        // later ones are created when the work (or a batch) is delivered, so nobody pays early.
        const plan = installmentsOf(client) ?? [
          { n: 1, label: 'Full payment before work starts', amountCents: totalCents, amount: money(totalCents), due: null },
        ];
        const dealKey = JSON.stringify(req);
        const replaces = openLink && openLink.deal !== dealKey ? openLink.linkId : null;
        const first = await api.createPaymentLink({
          callSessionId: host.callSessionId(),
          email,
          quote: client,
          installment: plan[0].n,
          amountCents: plan[0].amountCents,
          deal: req,
          ...(replaces ? { replacesLinkId: replaces } : {}),
        });
        if (first.alreadyPaid) {
          openLink = null;
          return {
            already_paid: true,
            error: 'The client already paid the earlier link, so no new link was made. Tell them their earlier payment went through and the team will sort out the change by email.',
          };
        }
        if (first.samplesRefused) {
          return {
            samples_refused: true,
            samples_left: first.samplesRefused.left,
            error: 'No link was made: this account has already had its sample pack (once per account). Tell them kindly and offer a real order instead (Done For You orders start at $30).',
          };
        }
        const installments: DealInstallment[] = plan.map((p, i) => ({ ...p, url: i === 0 ? first.url : null }));
        const simulated = first.simulated;
        const url = first.url;
        const panel = { kind: 'deal' as const, title: 'Your order', rows, total, url, installments, simulated };
        const payment = { url, total, totalCents, simulated, email, installments, linkId: first.linkId ?? null };
        host.showPanel(panel);
        host.setPayment(payment);
        unpaidLink = true;
        trackRubyPaymentLinkCreated({
          total_cents: totalCents,
          first_payment_cents: plan[0].amountCents,
          installments: plan.length,
          simulated: !!simulated,
        });
        if (!simulated && first.linkId) {
          const linkId = first.linkId;
          openLink = { linkId, deal: dealKey };
          host.watchPayment?.(linkId, (paidAt) => {
            if (openLink?.linkId === linkId) openLink = null;
            unpaidLink = false;
            void host.showPanel({ ...panel, paid: true });
            host.setPayment({ ...payment, status: 'paid', paidAt });
          });
        }
        host.updateLead({ email, payment_link: url, payment_total: total });
        return { url, total, totalCents, simulated, installments, say_next: SAY_WITH_LINK };
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
