/**
 * Contract tests for the signup-attribution snippet in index.html.
 *
 * The snippet cannot be a module: it has to run in <head> on the very first landing,
 * before main.tsx's host-redirect check can location.replace() away (main.tsx:68-81).
 * So there is nothing to import — these tests read the real index.html, extract the
 * script body, and execute it against a controlled document/location.
 *
 * Two reasons this file exists rather than trusting the inline code:
 *
 * 1. The contract is fixed by DEPLOYED backend code (fastapi-auth-service
 *    attribution.py:37-43) — cookie name, the five key letters, the length caps. A
 *    mismatch fails completely and silently: sign-in still works, nothing errors, and
 *    every utm_* column stays NULL. Nothing else in this repo would catch that.
 * 2. index.html is a file the Lovable/gpt-engineer bot has historically regenerated.
 *    It has been dormant since 2026-05-31, but if it ever wakes up and drops this
 *    block, this test fails loudly instead of attribution quietly going dark.
 *
 * formanova-marketing ships the same body with <script is:inline>. Keep them
 * byte-identical. See attribution-decisions.md §4.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INDEX_HTML = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');

/** The attribution IIFE, pulled out of index.html by the cookie name it writes. */
function extractSnippet(): string {
  const scripts = [...INDEX_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const found = scripts.filter((s) => s.includes('fn_attr'));
  expect(found, 'exactly one inline script in index.html should write fn_attr').toHaveLength(1);
  return found[0];
}

interface FakeDoc { cookie: string; referrer: string }

/**
 * Run the snippet against a fake document/location and report what it did.
 * `writes` captures every raw `document.cookie = ...` assignment, so attribute
 * strings can be asserted, not just the resulting value.
 */
function run(opts: { search?: string; pathname?: string; referrer?: string; jar?: string }) {
  const writes: string[] = [];
  let jar = opts.jar ?? '';

  const doc: FakeDoc = {
    get cookie() { return jar; },
    set cookie(v: string) {
      writes.push(v);
      const [pair] = v.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq);
      const others = jar.split('; ').filter((c) => c && c.split('=')[0] !== name);
      jar = [...others, pair].join('; ');
    },
    referrer: opts.referrer ?? '',
  };

  const loc = { search: opts.search ?? '', pathname: opts.pathname ?? '/' };

  new Function('document', 'location', extractSnippet())(doc, loc);

  const m = jar.match(/(?:^|;\s*)fn_attr=([^;]*)/);
  let payload: Record<string, string> | null = null;
  // Decoding is a convenience for assertions, not something the snippet does to an
  // existing cookie — so a deliberately corrupt fixture must not fail the harness.
  if (m) { try { payload = JSON.parse(decodeURIComponent(m[1])); } catch { payload = null; } }
  return { writes, raw: m ? m[1] : null, payload };
}

describe('attribution snippet — presence', () => {
  it('is inline in index.html, not an external file', () => {
    expect(INDEX_HTML).toContain('fn_attr');
    // An external src would defeat the point: it can arrive after a redirect.
    expect(INDEX_HTML).not.toMatch(/<script[^>]+src=[^>]*attribution/i);
  });

  it('sits in <head>, before the module entry point', () => {
    expect(INDEX_HTML.indexOf('fn_attr')).toBeLessThan(INDEX_HTML.indexOf('</head>'));
    expect(INDEX_HTML.indexOf('fn_attr')).toBeLessThan(INDEX_HTML.indexOf('/src/main.tsx'));
  });
});

describe('attribution snippet — cookie contract (fixed by deployed backend)', () => {
  it('writes exactly the five agreed keys', () => {
    const { payload } = run({ search: '?utm_source=x' });
    expect(Object.keys(payload).sort()).toEqual(['c', 'l', 'm', 'r', 's']);
  });

  it('sets every required cookie attribute', () => {
    const { writes } = run({});
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain(';domain=.formanova.ai');
    expect(writes[0]).toContain(';path=/');
    expect(writes[0]).toContain(';max-age=2592000');
    expect(writes[0]).toContain(';SameSite=Lax');
    expect(writes[0]).toContain(';Secure');
  });

  it('applies the length caps 100/100/100/400/200', () => {
    const long = 'a'.repeat(600);
    const { payload } = run({
      search: `?utm_source=${long}&utm_medium=${long}&utm_campaign=${long}`,
      referrer: `https://ext.example.com/${long}`,
      pathname: `/${long}`,
    });
    expect(payload.s).toHaveLength(100);
    expect(payload.m).toHaveLength(100);
    expect(payload.c).toHaveLength(100);
    expect(payload.r).toHaveLength(400);
    expect(payload.l).toHaveLength(200);
  });

  it('URI-encodes the JSON value', () => {
    const { raw } = run({ search: '?utm_source=a b&utm_medium=x' });
    expect(raw).not.toContain('{');
    expect(JSON.parse(decodeURIComponent(raw!)).s).toBe('a b');
  });
});

describe('attribution snippet — capture', () => {
  it('records UTMs and the landing path', () => {
    const { payload } = run({
      search: '?utm_source=google&utm_medium=cpc&utm_campaign=spring',
      pathname: '/pricing',
    });
    expect(payload).toMatchObject({ s: 'google', m: 'cpc', c: 'spring', l: '/pricing' });
  });

  it('writes on a bare direct visit — no guard (decisions §1)', () => {
    // A direct visit stores landing_path only. That is what separates genuine direct
    // traffic from a capture failure, which is all-NULL. Do not reintroduce a guard.
    const { payload } = run({ pathname: '/' });
    expect(payload).toEqual({ s: '', m: '', c: '', r: '', l: '/' });
  });

  it('keeps a genuine external referrer', () => {
    const { payload } = run({ referrer: 'https://www.google.com/' });
    expect(payload.r).toBe('https://www.google.com/');
  });

  it('keeps app-scheme referrers, so an in-app click is not read as direct', () => {
    const { payload } = run({ referrer: 'android-app://com.google.android.gm' });
    expect(payload.r).toBe('android-app://com.google.android.gm');
  });
});

describe('attribution snippet — self-referral', () => {
  it.each([
    'https://formanova.ai/blog/x',
    'https://www.formanova.ai/',
    'https://staging-gsdgds12.formanova.ai/',
  ])('blanks the referrer for %s', (referrer) => {
    expect(run({ referrer }).payload.r).toBe('');
  });

  it.each([
    ['a lookalike domain', 'https://notformanova.ai/'],
    ['our name in someone else’s path', 'https://news.example.com/formanova.ai-review'],
  ])('does not blank %s', (_label, referrer) => {
    expect(run({ referrer }).payload.r).toBe(referrer);
  });
});

describe('attribution snippet — first touch wins', () => {
  it('never overwrites an existing value', () => {
    const first = encodeURIComponent(JSON.stringify({ s: 'google', m: 'cpc', c: '', r: '', l: '/' }));
    const { payload } = run({
      jar: `fn_attr=${first}`,
      search: '?utm_source=facebook&utm_medium=paid',
    });
    expect(payload.s).toBe('google');
  });

  it('re-stamps the expiry of an existing value (Safari 7-day ITP cap)', () => {
    const first = encodeURIComponent(JSON.stringify({ s: 'google', m: '', c: '', r: '', l: '/' }));
    const { writes, raw } = run({ jar: `fn_attr=${first}` });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('max-age=2592000');
    expect(raw).toBe(first); // byte-identical value; only the clock moved
  });

  it('is not fooled by a cookie whose name merely ends in fn_attr', () => {
    const { payload } = run({ jar: 'xfn_attr=decoy', search: '?utm_source=real' });
    expect(payload.s).toBe('real');
  });

  it('ignores an unrelated cookie sitting alongside it', () => {
    const { payload } = run({ jar: 'sidebar:state=true', search: '?utm_source=real' });
    expect(payload.s).toBe('real');
  });
});

describe('attribution snippet — never throws', () => {
  it('survives a malformed referrer', () => {
    expect(() => run({ referrer: 'not a url' })).not.toThrow();
    expect(run({ referrer: 'not a url' }).payload!.r).toBe('');
  });

  it('survives a corrupt existing cookie, re-stamping it verbatim', () => {
    // The snippet never decodes an existing value, so a corrupt one cannot throw.
    // Documenting the consequence: it is re-stamped rather than repaired, so a
    // corrupted fn_attr stays corrupt for as long as the visitor keeps returning.
    // Vanishingly unlikely (nothing else writes this cookie, and the worst-case
    // payload is ~2.5KB against a 4KB limit) but it is not self-healing.
    const corrupt = 'fn_attr=%%%not-json%%%';
    let out!: ReturnType<typeof run>;
    expect(() => { out = run({ jar: corrupt, search: '?utm_source=real' }); }).not.toThrow();
    expect(out.raw).toBe('%%%not-json%%%');
    expect(out.writes[0]).toContain('max-age=2592000');
  });

  it('does not break the page when document.cookie is unwritable', () => {
    const doc = { get cookie() { return ''; }, set cookie(_v: string) { throw new Error('blocked'); }, referrer: '' };
    const fn = new Function('document', 'location', extractSnippet());
    expect(() => fn(doc, { search: '', pathname: '/' })).not.toThrow();
  });
});
