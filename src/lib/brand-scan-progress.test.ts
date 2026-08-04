import { describe, expect, it } from 'vitest';
import {
  EMPTY_BRAND_SCAN_PROGRESS,
  createBrandScanProgressTimeline,
  mergeBrandScanProgress,
  type BrandScanProgress,
} from '@/lib/brand-scan-progress';

/** Wraps payloads in the envelope the deployed scanner actually sends. */
function events(...items: Array<{ kind: string; payload: Record<string, unknown>; t?: number }>) {
  return {
    events: items.map((item, i) => ({
      id: String(i),
      event: 'data',
      data: {
        event_type: 'data',
        kind: item.kind,
        payload: item.payload,
        scan_id: 'scan-1',
        seq: i,
        t_ms: item.t ?? i * 1000,
      },
    })),
  };
}

describe('brand scan progress accumulation', () => {
  it('keeps a discovered palette when a later event carries only the photo palette', () => {
    const first = mergeBrandScanProgress(
      EMPTY_BRAND_SCAN_PROGRESS,
      events({ kind: 'palette_extracted', payload: { hexes: ['#7A2233', '#F4E8D5'] } }),
    );
    expect(first.sitePalette).toEqual(['#7A2233', '#F4E8D5']);

    const second = mergeBrandScanProgress(
      first,
      events({ kind: 'palette_extracted', payload: { photo: [{ hex: '#2C3E4F' }] }, t: 9_000 }),
    );

    // The site palette was already shown to the merchant. A later event that
    // only reports photo colours must not erase it.
    expect(second.sitePalette).toEqual(['#7A2233', '#F4E8D5']);
    expect(second.photoPalette).toEqual(['#2C3E4F']);
  });

  it('keeps product titles when a later probe reports none', () => {
    const first = mergeBrandScanProgress(
      EMPTY_BRAND_SCAN_PROGRESS,
      events({ kind: 'products_found', payload: { count: 12, titles: ['Halo Ring', 'Pearl Drop'] } }),
    );
    expect(first.productTitles).toEqual(['Halo Ring', 'Pearl Drop']);

    // The deployed scanner revisits product_probes and can re-emit an empty
    // result (observed on malabargoldanddiamonds.com, scan pending-c6ee42e199bd).
    const second = mergeBrandScanProgress(
      first,
      events({ kind: 'products_found', payload: { count: 0, titles: [] }, t: 139_775 }),
    );

    expect(second.productTitles).toEqual(['Halo Ring', 'Pearl Drop']);
    expect(second.productCount).toBe(12);
  });

  it('keeps detected fonts when a later event reports an empty family list', () => {
    const first = mergeBrandScanProgress(
      EMPTY_BRAND_SCAN_PROGRESS,
      events({ kind: 'fonts_detected', payload: { families: ['Didot', 'Inter'] } }),
    );

    const second = mergeBrandScanProgress(
      first,
      events({ kind: 'fonts_detected', payload: { families: [] }, t: 9_000 }),
    );

    expect(second.fonts).toEqual(['Didot', 'Inter']);
  });

  it('treats an event as the same event when scan_id changes mid-scan', () => {
    // The scanner reports a pending handle while in flight, then the stored run
    // id, then null once the activity ends. Keying on scan_id made the same seq
    // look like a new event each time it changed.
    const build = (scanId: string | null) => ({
      events: [{
        id: '2',
        event: 'data',
        data: {
          event_type: 'data',
          kind: 'products_found',
          payload: { count: 18, titles: ['Nakshi Bangle'] },
          scan_id: scanId,
          seq: 2,
          t_ms: 8911,
        },
      }],
    });

    const updates: BrandScanProgress[] = [];
    const timeline = createBrandScanProgressTimeline((p) => updates.push(p));

    timeline.ingest(build('pending-f9fea0e546aa'));
    expect(updates).toHaveLength(1);

    timeline.ingest(build('20260804T073201Z-www-isharya-com-45ca7a6c'));
    timeline.ingest(build(null));

    // Same seq, so nothing new to reveal.
    expect(updates).toHaveLength(1);
    timeline.stop();
  });

  it('applies events in seq order when t_ms ties', () => {
    // palette_extracted and fonts_detected are emitted at the same millisecond.
    const progress = mergeBrandScanProgress(EMPTY_BRAND_SCAN_PROGRESS, {
      events: [
        { id: '9', event: 'data', data: { kind: 'fonts_detected', payload: { families: ['Poppins'] }, seq: 9, t_ms: 36419 } },
        { id: '8', event: 'data', data: { kind: 'palette_extracted', payload: { hexes: ['#7A2233'] }, seq: 8, t_ms: 36419 } },
      ],
    });

    expect(progress.fonts).toEqual(['Poppins']);
    expect(progress.sitePalette).toEqual(['#7A2233']);
  });

  it('records the page the scanner reported rendering', () => {
    const progress = mergeBrandScanProgress(
      EMPTY_BRAND_SCAN_PROGRESS,
      events({
        kind: 'screenshot_ready',
        payload: {
          page_url: 'https://www.quirksmith.com/collections/earrings',
          artifact_path: '/opt/runs/P002_about.jpg',
        },
      }),
    );

    expect(progress.lastPageUrl).toBe('https://www.quirksmith.com/collections/earrings');
    expect(progress.screenshotReady).toBe(true);
  });

  it('keeps the last known page when a later screenshot event omits the url', () => {
    const first = mergeBrandScanProgress(
      EMPTY_BRAND_SCAN_PROGRESS,
      events({ kind: 'screenshot_ready', payload: { page_url: 'https://example.com/rings' } }),
    );
    const second = mergeBrandScanProgress(
      first,
      events({ kind: 'screenshot_ready', payload: { artifact_path: '/opt/runs/x.jpg' }, t: 9_000 }),
    );

    expect(second.lastPageUrl).toBe('https://example.com/rings');
  });

  it('still replaces a finding when the later event has a real value', () => {
    const first = mergeBrandScanProgress(
      EMPTY_BRAND_SCAN_PROGRESS,
      events({ kind: 'products_found', payload: { count: 2, titles: ['Old'] } }),
    );

    const second = mergeBrandScanProgress(
      first,
      events({ kind: 'products_found', payload: { count: 9, titles: ['New', 'Newer'] }, t: 5_000 }),
    );

    expect(second.productTitles).toEqual(['New', 'Newer']);
    expect(second.productCount).toBe(9);
  });
});
