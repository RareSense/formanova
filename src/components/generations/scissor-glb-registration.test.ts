import { describe, expect, it, vi } from 'vitest';
import { PendingCardRegistrationQueue } from './scissor-glb-registration';

describe('PendingCardRegistrationQueue', () => {
  it('flushes a card that registered before renderer readiness', () => {
    const queue = new PendingCardRegistrationQueue<{ label: string }>();
    const register = vi.fn();
    queue.upsert({ id: 'cad-1', glbUrl: '/api/artifacts/one', element: { label: 'slot' } });

    queue.drain(register);

    expect(register).toHaveBeenCalledWith({
      id: 'cad-1',
      glbUrl: '/api/artifacts/one',
      element: { label: 'slot' },
    });
    queue.drain(register);
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('removes a deferred registration when its slot unmounts', () => {
    const queue = new PendingCardRegistrationQueue<object>();
    const register = vi.fn();
    queue.upsert({ id: 'cad-1', glbUrl: '/api/artifacts/one', element: {} });
    queue.delete('cad-1');

    queue.drain(register);

    expect(register).not.toHaveBeenCalled();
  });
});
