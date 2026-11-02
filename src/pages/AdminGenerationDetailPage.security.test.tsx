import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const authFetch = vi.hoisted(() => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/authenticated-fetch', () => authFetch);
vi.mock('@/components/generations/ScissorGLBGrid', () => ({
  ScissorGLBGrid: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  GLBPreviewSlot: ({ glbUrl }: { glbUrl: string }) => <div data-testid="glb" data-url={glbUrl} />,
}));

import { DetailContent } from './AdminGenerationDetailPage';
import type { AdminGenerationDetail } from '@/lib/admin-generations-api';

const SHA = 'f'.repeat(64);

function run(workflow_name: string, input_payload: unknown, steps: AdminGenerationDetail['steps'] = []): AdminGenerationDetail {
  return {
    workflow_id: 'wf-sec', workflow_name, status: 'completed', user_email: 'a@b.co', user_type: null, is_paying: false,
    created_at: '2026-11-01T10:00:00Z', finished_at: null, actual_cost: 1, total_provider_cost: 1, input_payload, steps, feedback: null,
  };
}

function renderDetail(detail: AdminGenerationDetail) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DetailContent detail={detail} /></MemoryRouter>
    </QueryClientProvider>,
  );
}

const hrefs = (c: HTMLElement) => Array.from(c.querySelectorAll('a[href]')).map((a) => a.getAttribute('href') ?? '');
const srcs = (c: HTMLElement) => Array.from(c.querySelectorAll('img[src], iframe, script, object, embed')).map((e) => e.getAttribute('src') ?? e.tagName);

beforeEach(() => {
  authFetch.authenticatedFetch.mockReset();
  authFetch.authenticatedFetch.mockResolvedValue(new Response('{}', { status: 404 }));
});

describe('admin detail security', () => {
  it('XSS through keys, values, tool names and urls renders as text only', () => {
    const evil = '<img src=x onerror="alert(1)">';
    const { container } = renderDetail(run('<script>alert(0)</script>', {
      [evil]: '<script>alert(2)</script>',
      prompt: `${evil}\n<iframe src="javascript:alert(3)"></iframe>`,
      nested: { '<b onmouseover=alert(4)>k</b>': 'https://example.com/"><script>alert(5)</script>' },
    }, [{ tool_name: '<svg onload=alert(6)>', took_ms: 1, at: null, input: {}, output: { [evil]: evil } }]));
    expect(container.querySelector('script, iframe, svg[onload], b, object, embed')).toBeNull();
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(Array.from(container.querySelectorAll('*')).some((el) => Array.from(el.attributes).some((a) => /^on/i.test(a.name)))).toBe(false);
    expect(screen.getAllByText('<script>alert(2)</script>').length).toBeGreaterThan(0);
    expect(screen.getByText('<svg onload=alert(6)>')).toBeTruthy();
  });

  it('javascript:, vbscript:, //host, non-image data: and SVG data: urls are never linked or loaded', () => {
    const bad = {
      a: 'javascript:alert(1)', b: 'VBScript:msgbox(1)', c: '//evil.com/x.png', d: 'data:text/html,<script>alert(1)</script>',
      image: 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+', e: ' jav&#x09;ascript:alert(1)',
      art: { uri: 'javascript:alert(1)', type: 'image/png', sha256: SHA },
    };
    const { container } = renderDetail(run('sec_urls', bad));
    for (const h of hrefs(container)) expect(h).not.toMatch(/^(\s*javascript|vbscript|data:|\/\/)/i);
    for (const s of srcs(container)) expect(s).not.toMatch(/^(javascript|vbscript|data:image\/svg|data:text|\/\/)/i);
    expect(screen.getAllByText(/Not linked/).length).toBeGreaterThanOrEqual(5);
    // Still shown, as text: field `a` and the artifact's `uri`.
    expect(screen.getAllByText('javascript:alert(1)', { selector: 'span' }).length).toBe(2);
  });

  it('prototype-pollution keys are shown as data and never merged', () => {
    const payload = JSON.parse('{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted2":"yes"}},"hasOwnProperty":"x","images":[{"role":"constructor","artifact":"y"}]}');
    renderDetail(run('design_image_v1', payload));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted2).toBeUndefined();
    expect(screen.getAllByText('yes').length).toBe(2);
    expect(screen.getByText('x')).toBeTruthy();
  });

  it('external image hosts are not auto-loaded: a warned link instead', () => {
    const { container } = renderDetail(run('sec_hosts', { model_image_url: 'https://tracker.example.com/p.gif' }));
    expect(srcs(container).some((s) => s.includes('tracker.example.com'))).toBe(false);
    expect(screen.getByText('External image, not loaded')).toBeTruthy();
    const link = container.querySelector('a[href="https://tracker.example.com/p.gif"]');
    expect(link?.getAttribute('rel')).toContain('noreferrer');
  });

  it('external 3D models are not previewed and external files are never fetched with the admin token', () => {
    renderDetail(run('sec_files', {}, [{
      tool_name: 't', took_ms: 1, at: null, input: {},
      output: { model: 'https://cdn.example.com/m/ring.glb', file: 'https://cdn.example.com/m/ring.3dm', local: `/api/artifacts/${SHA}.3dm` },
    }]));
    expect(screen.queryByTestId('glb')).toBeNull();
    expect(screen.queryByRole('button', { name: /Show 3D preview/ })).toBeNull();
    for (const b of screen.queryAllByRole('button', { name: /^Download/ })) fireEvent.click(b);
    const called = authFetch.authenticatedFetch.mock.calls.map((c) => String(c[0]));
    expect(called.some((u) => u.includes('cdn.example.com'))).toBe(false);
    expect(called).toContain(`/api/artifacts/${SHA}`);
  });

  it('a picture that fails to load says so instead of spinning forever', async () => {
    renderDetail(run('sec_fail', { image: { uri: `/api/artifacts/${SHA}`, type: 'image/png', sha256: SHA } }));
    expect(await screen.findByText('Could not load')).toBeTruthy();
  });

  it('huge payloads render bounded and fast: 10k keys, a 5 MB string, 1000-deep nesting, 2000 pictures', () => {
    const many: Record<string, number> = {};
    for (let i = 0; i < 10_000; i += 1) many[`k${i}`] = i;
    let deep: Record<string, unknown> = { bottom: 'reached' };
    for (let i = 0; i < 1000; i += 1) deep = { d: deep };
    const pictures = Array.from({ length: 2000 }, (_, i) => `/api/artifacts/${i.toString(16).padStart(64, '0')}`);
    const t0 = performance.now();
    const { container } = renderDetail(run('sec_huge', { many, big: 'x'.repeat(5_000_000), deep, pictures }));
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(5000);
    expect(container.querySelectorAll('[data-path]').length).toBeLessThan(400);
    expect(container.querySelectorAll('figure').length).toBeLessThanOrEqual(24);
    // Text queries, not role queries: role names are computed for every button, which is slow
    // on a big tree and would measure the test library rather than the page.
    const buttons = Array.from(container.querySelectorAll('button')).map((b) => b.textContent ?? '');
    expect(buttons.some((t) => /Show 100 more of 9900/.test(t))).toBe(true);
    expect(buttons.some((t) => /Show all \(5,000,000 characters/.test(t))).toBe(true);
    // Galleries page twice: 100 children at a time, then 24 thumbnails at a time.
    expect(buttons.some((t) => /Show 24 more of 76 pictures/.test(t))).toBe(true);
    expect(buttons.some((t) => /Show 100 more of 1900/.test(t))).toBe(true);
    fireEvent.click(screen.getByText('Show deeper levels'));
    expect(screen.getAllByText('Show deeper levels').length).toBe(1);
  }, 30_000);
});
