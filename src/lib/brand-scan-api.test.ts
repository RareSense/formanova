import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { pollWorkflow } from '@/lib/poll-workflow';
import { parseBrandScanResult, resolveBrandScanState, runBrandScan } from '@/lib/brand-scan-api';

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
    mockAuthenticatedFetch.mockResolvedValueOnce(jsonResponse({ workflow_id: 'state-123' }));
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
    expect(mockAuthenticatedFetch).toHaveBeenNthCalledWith(3, '/api/result/state-123', expect.any(Object));
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

  it('hides workflow-spec details from users on a 409 start response', async () => {
    mockAuthenticatedFetch.mockResolvedValueOnce(jsonResponse({ detail: 'missing terminal edge' }, 409));

    await expect(runBrandScan('https://atelier.example'))
      .rejects.toThrow('Brand scan is temporarily unavailable. Please try again later.');
    expect(mockPollWorkflow).not.toHaveBeenCalled();
  });
});
