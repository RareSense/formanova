import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useRestoredRunPrompt } from './useRestoredRunPrompt';

/** The page's own prompt state, driven by what the workflow hook reports. */
function setup(initialPrompt = '') {
  const onRestore = vi.fn();
  const hook = renderHook(
    ({ restoreCount, restoredPrompt }: { restoreCount: number; restoredPrompt: string | null }) => {
      const [prompt, setPrompt] = useState(initialPrompt);
      useRestoredRunPrompt({ restoreCount, restoredPrompt, prompt, setPrompt, onRestore });
      return { prompt, setPrompt };
    },
    { initialProps: { restoreCount: 0, restoredPrompt: null as string | null } },
  );
  return { ...hook, onRestore };
}

describe('useRestoredRunPrompt', () => {
  it('does nothing before any restore', () => {
    const { result, onRestore } = setup('my own words');
    expect(result.current.prompt).toBe('my own words');
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('replaces a leftover prompt with the restored run\'s, and tells the page to drop its session photos', () => {
    const { result, rerender, onRestore } = setup('leftover from this session');
    rerender({ restoreCount: 1, restoredPrompt: 'US 7, band 2 mm' });
    expect(result.current.prompt).toBe('US 7, band 2 mm');
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it('clears a leftover prompt when the restored run had none', () => {
    const { result, rerender } = setup('leftover');
    rerender({ restoreCount: 1, restoredPrompt: null });
    expect(result.current.prompt).toBe('');
  });

  it('fills the prompt when the run\'s lookup lands after the restore', () => {
    const { result, rerender } = setup('leftover');
    rerender({ restoreCount: 1, restoredPrompt: null });
    rerender({ restoreCount: 1, restoredPrompt: 'arrived late' });
    expect(result.current.prompt).toBe('arrived late');
  });

  it('never overwrites what the user typed after the restore', () => {
    const { result, rerender } = setup();
    rerender({ restoreCount: 1, restoredPrompt: null });
    act(() => result.current.setPrompt('typed by the user'));
    rerender({ restoreCount: 1, restoredPrompt: 'arrived late' });
    expect(result.current.prompt).toBe('typed by the user');
  });

  it('a second restore overrides again, even with the same prompt text', () => {
    const { result, rerender, onRestore } = setup();
    rerender({ restoreCount: 1, restoredPrompt: 'same' });
    act(() => result.current.setPrompt('edited'));
    rerender({ restoreCount: 2, restoredPrompt: 'same' });
    expect(result.current.prompt).toBe('same');
    expect(onRestore).toHaveBeenCalledTimes(2);
  });
});

vi.mock('@/lib/image-normalize', () => ({ normalizeImageFiles: async (files: File[]) => files }));
import { useReferenceImages } from './useReferenceImages';

describe('useRestoredRunPrompt with the page\'s reference photos', () => {
  it('drops this session\'s photos and prompt when a run is restored, as Image to CAD wires it', async () => {
    let n = 0;
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => `blob:${++n}`, revokeObjectURL: () => {} }));
    const { result, rerender } = renderHook(
      ({ restoreCount, restoredPrompt }: { restoreCount: number; restoredPrompt: string | null }) => {
        const images = useReferenceImages();
        const [prompt, setPrompt] = useState('');
        useRestoredRunPrompt({ restoreCount, restoredPrompt, prompt, setPrompt, onRestore: images.clearReferenceImages });
        return { images, prompt, setPrompt };
      },
      { initialProps: { restoreCount: 0, restoredPrompt: null as string | null } },
    );
    await act(async () => { await result.current.images.addReferenceImages([new File(['x'], 'session.png', { type: 'image/png' })]); });
    act(() => result.current.setPrompt('typed this session'));
    expect(result.current.images.referenceImagePreviewUrls).toHaveLength(1);

    rerender({ restoreCount: 1, restoredPrompt: 'the run\'s own prompt' });
    expect(result.current.images.referenceImagePreviewUrls).toEqual([]);
    expect(result.current.prompt).toBe('the run\'s own prompt');
    vi.unstubAllGlobals();
  });
});
