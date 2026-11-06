/**
 * Runs the tools Ruby's reasoning head asks for during a live call (OpenAI
 * live-session delegation), ported from Nova's onResponseEvent (formanova-sales-agent
 * public/app.js). Each function call starts as soon as its item is done; when the
 * head's response completes, every output is sent back as a function_call_output
 * item followed by one response.create.
 */

export type ToolOutput = Record<string, unknown>;
export type ToolRunner = (name: string, args: Record<string, unknown>) => Promise<ToolOutput> | ToolOutput;

/** A delegation still counts as "checking" for at most this long. */
const DELEGATION_STALE_MS = 20_000;
const DONE_EVENTS = new Set(['response.completed', 'response.done', 'response.incomplete']);

interface ResponseEvent {
  type?: string;
  item?: { type?: string; call_id?: string; name?: string; arguments?: string };
}

interface DelegationState {
  calls: Map<string, Promise<ToolOutput>>;
}

export interface DelegationOptions {
  runTool: ToolRunner;
  send(obj: unknown): void;
  /** False once the call is over: outputs are then dropped. */
  isActive(): boolean;
  /** Fired when the number of running tools / open delegations changes. */
  onBusyChange?(busy: boolean): void;
  now?: () => number;
}

export class DelegationRunner {
  private opts: DelegationOptions;
  private delegations = new Map<string, DelegationState>();
  private open = new Map<string, number>();
  private running = 0;
  private wasBusy = false;
  private now: () => number;

  constructor(opts: DelegationOptions) {
    this.opts = opts;
    this.now = opts.now ?? (() => Date.now());
  }

  /** True while a tool runs or the head is still thinking (bounded). */
  isBusy(): boolean {
    if (this.running > 0) return true;
    const now = this.now();
    for (const started of this.open.values()) if (now - started < DELEGATION_STALE_MS) return true;
    return false;
  }

  private emitBusy() {
    const busy = this.isBusy();
    if (busy === this.wasBusy) return;
    this.wasBusy = busy;
    this.opts.onBusyChange?.(busy);
  }

  delegationCreated(id: string | null | undefined) {
    if (!id) return;
    this.open.set(id, this.now());
    this.emitBusy();
  }

  handle(delegationId: string | null | undefined, e: ResponseEvent) {
    const key = delegationId || 'none';
    let d = this.delegations.get(key);
    if (!d) {
      d = { calls: new Map() };
      this.delegations.set(key, d);
    }
    if (e.type === 'response.created') {
      d.calls = new Map();
    } else if (e.type === 'response.output_item.done' && e.item?.type === 'function_call') {
      const { call_id, name } = e.item;
      if (!call_id || d.calls.has(call_id)) return;
      let args: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(e.item.arguments || '{}');
        if (parsed && typeof parsed === 'object') args = parsed;
      } catch {
        /* the tool gets empty args */
      }
      d.calls.set(call_id, this.run(name || '', args));
    } else if (e.type && DONE_EVENTS.has(e.type)) {
      const pending = d.calls;
      d.calls = new Map();
      if (!pending.size) {
        if (delegationId) this.open.delete(delegationId);
        this.emitBusy();
        return;
      }
      void Promise.all([...pending].map(async ([callId, p]) => [callId, await p] as const)).then((results) => {
        if (!this.opts.isActive()) return;
        for (const [callId, output] of results) {
          this.opts.send({
            type: 'response.item.create',
            item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(output) },
          });
        }
        this.opts.send({ type: 'response.create' });
      });
    }
  }

  private async run(name: string, args: Record<string, unknown>): Promise<ToolOutput> {
    this.running++;
    this.emitBusy();
    try {
      const out = await this.opts.runTool(name, args);
      return out && typeof out === 'object' ? out : { error: 'The tool returned nothing.' };
    } catch {
      return { error: 'The tool could not be reached. Nothing was changed.' };
    } finally {
      this.running = Math.max(0, this.running - 1);
      this.emitBusy();
    }
  }

  /** Re-checks the busy state (a stale delegation stops counting without an event). */
  tick() {
    this.emitBusy();
  }

  reset() {
    this.delegations.clear();
    this.open.clear();
    this.running = 0;
    this.emitBusy();
  }
}
