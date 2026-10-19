import { afterEach, describe, expect, it, vi } from 'vitest';
import { blockIfCadDown, CadServiceDownError, onCadDownPopup, setCadServiceDownForTests } from '@/lib/cad-service-status';
import { startDesignImage } from '@/lib/design-image-run';
import { startImproveFromVersion } from '@/lib/cad-versions-api';

const fetchSpy = vi.hoisted(() => vi.fn());
vi.mock('@/lib/authenticated-fetch', () => ({ authenticatedFetch: fetchSpy }));

afterEach(() => {
  setCadServiceDownForTests(false);
  fetchSpy.mockReset();
});

describe('CAD services down', () => {
  it('blocks and opens the popup only while down', () => {
    const popup = vi.fn();
    const off = onCadDownPopup(popup);
    expect(blockIfCadDown()).toBe(false);
    setCadServiceDownForTests(true);
    expect(blockIfCadDown()).toBe(true);
    expect(popup).toHaveBeenCalledTimes(1);
    off();
  });

  it('never sends a design picture or an improvement request while down', async () => {
    setCadServiceDownForTests(true);
    await expect(startDesignImage({} as never)).rejects.toBeInstanceOf(CadServiceDownError);
    await expect(startImproveFromVersion('a1')).rejects.toBeInstanceOf(CadServiceDownError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
