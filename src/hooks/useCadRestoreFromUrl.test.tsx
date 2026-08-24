import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';

import { useCadRestoreFromUrl } from './useCadRestoreFromUrl';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** Exposes a navigate button so a test can move within the same route, which
 *  is what the completion toast and the header indicator actually do. */
function Harness({
  restore,
  onFailure,
  goTo,
}: {
  restore: (id: string | null, glb?: string | null) => Promise<boolean>;
  onFailure: () => void;
  goTo?: string;
}) {
  const navigate = useNavigate();
  useCadRestoreFromUrl({
    cadRoute: '/text-to-cad',
    restoreCompletedWorkflow: restore,
    onFailure,
  });
  return (
    <button type="button" onClick={() => goTo && navigate(goTo)}>
      go
    </button>
  );
}

function render(initialPath: string, props: Omit<React.ComponentProps<typeof Harness>, never>) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <MemoryRouter
        initialEntries={[initialPath]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/text-to-cad" element={<Harness {...props} />} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

/** Lets the promise returned by restore settle inside act(). */
async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

let restore: ReturnType<typeof vi.fn>;
let onFailure: ReturnType<typeof vi.fn>;

beforeEach(() => {
  restore = vi.fn().mockResolvedValue(true);
  onFailure = vi.fn();
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe('useCadRestoreFromUrl', () => {
  it('does nothing when the URL carries no result', async () => {
    render('/text-to-cad', { restore, onFailure });
    await flush();
    expect(restore).not.toHaveBeenCalled();
  });

  it('restores from a workflow_id and strips the params', async () => {
    render('/text-to-cad?workflow_id=wf-1&src=external', { restore, onFailure });
    await flush();
    expect(restore).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledWith('wf-1', null);
  });

  it('passes the glb hint through as the fallback', async () => {
    render('/text-to-cad?workflow_id=wf-1&glb=https://blob/x.glb', { restore, onFailure });
    await flush();
    expect(restore).toHaveBeenCalledWith('wf-1', 'https://blob/x.glb');
  });

  it('restores from a bare glb link with no workflow id', async () => {
    render('/text-to-cad?glb=https://blob/x.glb', { restore, onFailure });
    await flush();
    expect(restore).toHaveBeenCalledWith(null, 'https://blob/x.glb');
  });

  it('treats a blank workflow_id as absent', async () => {
    render('/text-to-cad?workflow_id=%20%20', { restore, onFailure });
    await flush();
    expect(restore).not.toHaveBeenCalled();
  });

  // The regression this hook exists for. The toast and the header indicator
  // are clicked while the CAD page is already mounted, so React Router swaps
  // the query string without remounting. A mount-only effect never re-ran and
  // the restore silently did nothing, taking cad_result_restored with it.
  it('restores again when navigating to the same route with a new result', async () => {
    render('/text-to-cad', {
      restore,
      onFailure,
      goTo: '/text-to-cad?workflow_id=wf-2&src=toast',
    });
    await flush();
    expect(restore).not.toHaveBeenCalled();

    await act(async () => {
      container?.querySelector('button')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    await flush();

    expect(restore).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledWith('wf-2', null);
  });

  it('reports failure when the result cannot be loaded', async () => {
    restore.mockResolvedValue(false);
    render('/text-to-cad?workflow_id=wf-1', { restore, onFailure });
    await flush();
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it('stays quiet on a successful restore', async () => {
    render('/text-to-cad?workflow_id=wf-1', { restore, onFailure });
    await flush();
    expect(onFailure).not.toHaveBeenCalled();
  });

  // Stripping the params re-runs the effect. If that re-run were not an early
  // return the hook would restore forever.
  it('does not loop after stripping the params', async () => {
    render('/text-to-cad?workflow_id=wf-1', { restore, onFailure });
    await flush();
    await flush();
    await flush();
    expect(restore).toHaveBeenCalledTimes(1);
  });
});
