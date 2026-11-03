import { describe, it, expect, vi } from 'vitest';
import { DelegationRunner } from './delegation';

const flush = () => new Promise((r) => setTimeout(r, 0));

function make(runTool = vi.fn(async (name: string) => ({ ran: name }))) {
  const sent: Record<string, unknown>[] = [];
  const busy: boolean[] = [];
  let active = true;
  const runner = new DelegationRunner({
    runTool,
    send: (o) => sent.push(o as Record<string, unknown>),
    isActive: () => active,
    onBusyChange: (b) => busy.push(b),
  });
  return { runner, sent, busy, runTool, stop: () => (active = false) };
}

const fnCall = (call_id: string, name: string, args: unknown = {}) => ({
  type: 'response.output_item.done',
  item: { type: 'function_call', call_id, name, arguments: JSON.stringify(args) },
});

describe('DelegationRunner', () => {
  it('runs each function call once and answers with outputs then response.create', async () => {
    const { runner, sent, runTool } = make();
    runner.handle('d1', { type: 'response.created' });
    runner.handle('d1', fnCall('c1', 'show_on_screen', { kind: 'list' }));
    runner.handle('d1', fnCall('c1', 'show_on_screen', { kind: 'list' }));
    runner.handle('d1', fnCall('c2', 'clear_screen'));
    expect(runTool).toHaveBeenCalledTimes(2);
    expect(runTool).toHaveBeenCalledWith('show_on_screen', { kind: 'list' });
    expect(sent).toEqual([]);
    runner.handle('d1', { type: 'response.completed' });
    await flush();
    expect(sent).toEqual([
      { type: 'response.item.create', item: { type: 'function_call_output', call_id: 'c1', output: '{"ran":"show_on_screen"}' } },
      { type: 'response.item.create', item: { type: 'function_call_output', call_id: 'c2', output: '{"ran":"clear_screen"}' } },
      { type: 'response.create' },
    ]);
  });

  it('turns a throwing tool and bad arguments into safe outputs', async () => {
    const runTool = vi.fn(async () => {
      throw new Error('boom');
    });
    const { runner, sent } = make(runTool);
    runner.handle('d1', { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'c1', name: 'x', arguments: '{bad' } });
    expect(runTool).toHaveBeenCalledWith('x', {});
    runner.handle('d1', { type: 'response.done' });
    await flush();
    expect(JSON.parse((sent[0].item as { output: string }).output)).toHaveProperty('error');
  });

  it('sends nothing when the call has ended', async () => {
    const { runner, sent, stop } = make();
    runner.handle('d1', fnCall('c1', 'a'));
    stop();
    runner.handle('d1', { type: 'response.completed' });
    await flush();
    expect(sent).toEqual([]);
  });

  it('reports busy while the head thinks and a tool runs, idle after', async () => {
    let release: (v: Record<string, unknown>) => void = () => {};
    const runTool = vi.fn(() => new Promise<Record<string, unknown>>((r) => (release = r)));
    const { runner, busy } = make(runTool);
    runner.delegationCreated('d1');
    expect(runner.isBusy()).toBe(true);
    runner.handle('d1', fnCall('c1', 'quote_shoot'));
    runner.handle('d1', { type: 'response.completed' });
    release({ ok: true });
    await flush();
    expect(runner.isBusy()).toBe(true); // the delegation is still open
    runner.handle('d1', { type: 'response.completed' });
    expect(runner.isBusy()).toBe(false);
    expect(busy).toEqual([true, false]);
  });
});
