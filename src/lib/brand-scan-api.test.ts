import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { pollWorkflow } from '@/lib/poll-workflow';
import {
  EMPTY_BRAND_SCAN_PROGRESS,
  mergeBrandScanProgress,
  parseBrandScanResult,
  resolveBrandScanState,
  runBrandScan,
} from '@/lib/brand-scan-api';

vi.mock('@/lib/authenticated-fetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/poll-workflow', () => ({ pollWorkflow: vi.fn() }));

const mockAuthenticatedFetch = vi.mocked(authenticatedFetch);
const mockPollWorkflow = vi.mocked(pollWorkflow);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('brand scan API', () => {
  beforeEach(() => {
    mockAuthenticatedFetch.mockReset();
    mockPollWorkflow.mockReset();
  });

  it('normalizes the scanner result without hardcoded business values', () => {
    const result = parseBrandScanResult({
      scan_storefront: [{
        status: 'completed',
        readiness_level: 'full',
        requested_url: 'https://atelier.example',
        intelligence: {
          summary: 'Sculptural fine jewelry with a modern point of view.',
          colour_palette: [{ hex: '#121212' }, { hex: '#EADCC5' }],
          product_categories: ['Rings', 'Necklaces'],
          visual_style: ['Editorial', 'Minimal'],
          target_audience: 'Women 28–45',
          target_markets: ['US', 'UK'],
          location: 'London, UK',
          social_links: ['https://instagram.com/atelier'],
        },
      }],
    });

    expect(result).toMatchObject({
      status: 'completed',
      readinessLevel: 'full',
      errorMessage: null,
      requestedUrl: 'https://atelier.example',
      insights: {
        identity: 'Sculptural fine jewelry with a modern point of view.',
        palette: ['#121212', '#EADCC5'],
        productFocus: 'Rings, Necklaces',
        visualStyle: ['Editorial', 'Minimal'],
        targetMarkets: ['US', 'UK'],
        audience: 'Women 28–45',
        basedIn: 'London, UK',
        socialLinks: ['https://instagram.com/atelier'],
      },
    });
  });

  it('preserves blocked audit outcomes for the UI', () => {
    expect(parseBrandScanResult({
      scan_storefront: [{
        status: 'blocked',
        error_code: 'robots_denied',
        requested_url: 'https://instagram.com/example',
      }],
    })).toMatchObject({
      status: 'blocked',
      errorCode: 'robots_denied',
      requestedUrl: 'https://instagram.com/example',
    });
  });

  it('normalizes common Temporal status shapes', () => {
    expect(resolveBrandScanState({ runtime: { state: 'SUCCEEDED' } })).toBe('completed');
    expect(resolveBrandScanState({ progress: { state: 'running' } })).toBe('running');
    expect(resolveBrandScanState({ status: 'errored' })).toBe('failed');
  });

  it('starts the workflow with storefront_url and configures bounded polling', async () => {
    mockAuthenticatedFetch
      .mockResolvedValueOnce(jsonResponse({ workflow_id: 'state-123' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'running' }))
      .mockResolvedValueOnce(jsonResponse({ events: [] }))
      .mockResolvedValueOnce(jsonResponse({ scan_storefront: [{ status: 'completed' }] }));
    mockPollWorkflow.mockImplementationOnce(async (options) => ({
      status: 'completed',
      result: options.parseResult({ scan_storefront: [{ status: 'completed' }] }),
    }));

    await runBrandScan('https://atelier.example');

    expect(mockAuthenticatedFetch).toHaveBeenCalledWith('/api/brand/scan', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ storefront_url: 'https://atelier.example' }),
    }));
    expect(mockPollWorkflow).toHaveBeenCalledWith(expect.objectContaining({
      intervalMs: 2_000,
      timeoutMs: 450_000,
      max404s: 1,
      maxPollErrors: 5,
    }));

    const options = mockPollWorkflow.mock.calls[0][0];
    await options.fetchStatus?.();
    await options.fetchResult();
    expect(mockAuthenticatedFetch).toHaveBeenNthCalledWith(2, '/api/status/state-123', expect.any(Object));
    expect(mockAuthenticatedFetch).toHaveBeenNthCalledWith(3, '/api/status/state-123/phases', expect.any(Object));
    expect(mockAuthenticatedFetch).toHaveBeenNthCalledWith(4, '/api/result/state-123', expect.any(Object));
  });

  it('keeps scan progress append-only and accepts corrected product discovery', () => {
    const first = mergeBrandScanProgress(EMPTY_BRAND_SCAN_PROGRESS, {
      events: [
        { event_type: 'phase', t_ms: 100, payload: { phase: 'discovery', ordinal: 2, total: 8 } },
        { event_type: 'phase', t_ms: 200, payload: { phase: 'product_probes', ordinal: 3, total: 8 } },
        { event_type: 'data', t_ms: 210, kind: 'products_found', payload: { count: 0, titles: [] } },
        { event_type: 'phase', t_ms: 300, payload: { phase: 'browser', ordinal: 4, total: 8 } },
        { event_type: 'phase', t_ms: 400, payload: { phase: 'product_probes', ordinal: 3, total: 8 } },
        { event_type: 'data', t_ms: 410, kind: 'products_found', payload: { count: 24, titles: ['Halo Ring', 'Pearl Drop'] } },
      ],
    });

    expect(first.productCount).toBe(24);
    expect(first.productTitles).toEqual(['Halo Ring', 'Pearl Drop']);
    expect(first.completedPhases).toEqual(['discovery', 'product_probes', 'browser']);

    const afterVanishingHeartbeat = mergeBrandScanProgress(first, {
      status: 'completed',
      phases: [],
    });
    expect(afterVanishingHeartbeat.productCount).toBe(24);
    expect(afterVanishingHeartbeat.progressPercent).toBeGreaterThanOrEqual(first.progressPercent);
  });

  it('extracts palette, fonts, image count, and brand-read readiness from data events', () => {
    const progress = mergeBrandScanProgress(EMPTY_BRAND_SCAN_PROGRESS, {
      phases: [
        { event_type: 'phase', payload: { phase: 'processing' } },
        { event_type: 'data', kind: 'images_selected', payload: { count: 9 } },
        { event_type: 'data', kind: 'palette_extracted', payload: { site: ['#111'], photo: ['#abc', '#fff'] } },
        { event_type: 'data', kind: 'fonts_detected', payload: { families: ['Didot', 'Inter'] } },
        { event_type: 'data', kind: 'interpretation_ready', payload: { readiness: 'visual_only', confidence: 0.8 } },
      ],
    });

    expect(progress.imageCount).toBe(9);
    expect(progress.sitePalette).toEqual(['#111111']);
    expect(progress.photoPalette).toEqual(['#AABBCC', '#FFFFFF']);
    expect(progress.fonts).toEqual(['Didot', 'Inter']);
    expect(progress.brandReadReady).toBe(true);
  });

  it('uses the progress proxy even when the status payload has an empty phase list', () => {
    const progress = mergeBrandScanProgress(EMPTY_BRAND_SCAN_PROGRESS, {
      status: 'running',
      phases: [],
      scan_progress_events: {
        events: [{ event_type: 'phase', payload: { phase: 'images' } }],
      },
    });

    expect(progress.currentPhase).toBe('images');
  });

  it('surfaces backend validation detail when the start call fails', async () => {
    mockAuthenticatedFetch.mockResolvedValueOnce(jsonResponse({ storefront_url: 'invalid URL' }, 422));

    await expect(runBrandScan('http://127.0.0.1')).rejects.toThrow('invalid URL');
    expect(mockPollWorkflow).not.toHaveBeenCalled();
  });

  it('returns a terminal failed status as a normal scan outcome', async () => {
    mockAuthenticatedFetch.mockResolvedValueOnce(jsonResponse({ workflow_id: 'state-failed' }));
    mockPollWorkflow.mockImplementationOnce(async (options) => {
      options.onStatusData?.({
        status: 'failed',
        error_code: 'scanner_unauthorized',
        error: 'The storefront scanner could not be reached.',
      });
      throw new Error('Workflow failed');
    });

    await expect(runBrandScan('https://atelier.example')).resolves.toMatchObject({
      status: 'failed',
      errorCode: 'scanner_unauthorized',
      errorMessage: 'The storefront scanner could not be reached.',
    });
  });

  it('keeps only exact unique palette colors and retains documented analysis details', () => {
    const result = parseBrandScanResult({
      scan_storefront: [{
        status: 'completed',
        sources: ['website', 'store_catalog'],
        intelligence: {
          palette: [
            { hex: '#abc', label: 'Warm gray', weight: 0.6 },
            { hex: '#AABBCC', label: 'Duplicate' },
            { color: 'rgb(12, 34, 56)', percentage: 20 },
            { label: 'No machine-readable color' },
          ],
          aesthetic: 'minimal fine jewelry',
          photography_style: 'clean studio on white',
          gender_focus: 'womens',
          apparent_ethnicities: ['south asian', 'black'],
          price_positioning: 'premium',
          confidence: 0.91,
          brand_identity: { fonts: ['serif display'], logo_colors: ['#AABBCC'] },
          channels: { website: { aesthetic: 'catalog-first', pose_consistency: 'standardized' } },
        },
      }],
    });

    expect(result.insights.palette).toEqual(['#AABBCC', '#0C2238']);
    expect(result.insights.visualStyle).toEqual(['minimal fine jewelry', 'clean studio on white']);
    expect(result.insights.otherInfo).toContain('Gender focus: womens');
    expect(result.insights.otherInfo).toContain('Price positioning: premium');
    expect(result.insights.otherInfo).toContain('Brand fonts: serif display');
    expect(result.insights.otherInfo).toContain('Confidence: 91%');
    expect(result.insights.otherInfo).toContain('Sources analyzed: website, store_catalog');
    expect(result.insights.otherInfo).toContain('Website — Aesthetic: catalog-first; Pose Consistency: standardized');
  });

  it('maps the deployed scanner evidence shape without exposing raw page content', () => {
    const result = parseBrandScanResult({
      scan_storefront: [{
        evidence: {
          canonical_url: 'https://fallonjewelry.com/',
          discovered_categories: ['Earrings', 'Bracelets', 'Earrings'],
          discovered_material_terms: ['brass', 'gold plated', 'pearl'],
          measured_site_palette: [],
          measured_photo_palette: [
            { hex: '#FFFFFF', weight: 0.52, source: 'product_image' },
            { hex: '#858783', weight: 0.06, source: 'product_image' },
            { hex: '#FFFFFF', weight: 0.04, source: 'product_image' },
          ],
          intelligence_readiness: {
            level: 'visual_only',
            reasons: ['No machine-readable public price evidence was captured.'],
          },
          coverage: { products: 6, collections: 2, representative_images: 9 },
          images: [
            { visual_role: 'editorial_or_lifestyle' },
            { visual_role: 'studio_cutout' },
          ],
          identity_links: {
            observations: [{
              normalized_url: 'https://www.instagram.com/fallonjewelry/',
              original_url: 'https://instagram.com/fallonjewelry',
            }],
          },
          pages: [{
            page_type: 'home',
            description: 'FALLON is a luxury jewelry collection.',
            visible_text: 'RAW PAGE COPY THAT MUST NOT BE RENDERED',
          }],
        },
      }],
    });

    expect(result.readinessLevel).toBe('visual_only');
    expect(result.requestedUrl).toBe('https://fallonjewelry.com/');
    expect(result.insights.identity).toBe('FALLON is a luxury jewelry collection.');
    expect(result.insights.palette).toEqual(['#FFFFFF', '#858783']);
    expect(result.insights.productFocus).toBe('Earrings, Bracelets');
    expect(result.insights.visualStyle).toEqual(['Editorial Or Lifestyle', 'Studio Cutout']);
    expect(result.insights.socialLinks).toEqual(['https://www.instagram.com/fallonjewelry/']);
    expect(result.insights.otherInfo).toContain('Materials found: brass, gold plated, pearl');
    expect(result.insights.otherInfo).toContain('Coverage: 6 products, 2 collections, 9 representative images');
    expect(result.insights.otherInfo).not.toContain('RAW PAGE COPY');
  });

  it('renders detailed cited intelligence without leaking evidence ids into user-facing values', () => {
    const cited = (values: string[]) => ({
      values,
      confidence: 0.9,
      evidence_ids: ['P001', 'I002'],
      caveat: null,
    });
    const result = parseBrandScanResult({
      scan_storefront: [{
        intelligence: {
          aesthetic: cited(['high contrast', 'editorial']),
          seller_model: { value: 'own_brand_designer_or_maker', confidence: 0.93, evidence_ids: ['P001'] },
          niche: { value: 'Sculptural fine jewelry', confidence: 0.9, evidence_ids: ['P001'] },
          voice: cited(['direct', 'craftsmanship led']),
          likely_audience: cited(['design conscious collectors']),
          photography: cited(['isolated product cutouts']),
          shot_types_present: cited(['macro details', 'on model portraits']),
          product_shot_style: cited(['pale seamless backgrounds']),
          model_demographics: {
            gender_presentation: 'male',
            ethnicity_presentation: 'black_or_african_descent',
            age_group_presentation: 'young_adult_18_29',
            confidence: 0.8,
            evidence_ids: ['I002'],
          },
          model_styling_and_presentation: cited(['black streetwear']),
          campaign_or_ad_style: cited(['dark blue editorial']),
          visual_direction: {
            preserve: ['high contrast product focus'],
            explore: ['warmer lifestyle scenes'],
            avoid: ['generic luxury staging'],
            evidence_ids: ['I002'],
          },
          contradictions: ['Material language differs by SKU'],
          missing_information: ['Primary target market'],
          merchant_confirmation_questions: ['Which market matters most?'],
        },
      }],
    });

    expect(result.insights.visualStyle).toEqual(['high contrast', 'editorial']);
    expect(result.insights.audience).toBe('design conscious collectors');
    expect(result.insights.otherInfo).toContain('Seller model: Own Brand Designer Or Maker');
    expect(result.insights.otherInfo).toContain('Shot types: macro details, on model portraits');
    expect(result.insights.otherInfo).toContain('Model presentation: Male, Black Or African Descent, Young Adult 18 29');
    expect(result.insights.otherInfo).toContain('Campaign and ad style: dark blue editorial');
    expect(result.insights.otherInfo).toContain('Explore: warmer lifestyle scenes');
    expect(result.insights.otherInfo).toContain('Contradictions to confirm: Material language differs by SKU');
    expect(result.insights.otherInfo).not.toContain('P001');
    expect(result.insights.otherInfo).not.toContain('I002');
  });

  it('hides workflow-spec details from users on a 409 start response', async () => {
    mockAuthenticatedFetch.mockResolvedValueOnce(jsonResponse({ detail: 'missing terminal edge' }, 409));

    await expect(runBrandScan('https://atelier.example'))
      .rejects.toThrow('Brand scan is temporarily unavailable. Please try again later.');
    expect(mockPollWorkflow).not.toHaveBeenCalled();
  });
});
