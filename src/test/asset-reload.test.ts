import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Runs the reload snippet from the real index.html in jsdom.
const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
const snippet = html.slice(html.indexOf('(function() {\n        window.addEventListener(\'error\''), html.indexOf('}, true);\n      })();') + '}, true);\n      })();'.length);

let reload: ReturnType<typeof vi.fn>;
let listener: ((e: Event) => void) | undefined;

beforeEach(() => {
  sessionStorage.clear();
  reload = vi.fn();
  Object.defineProperty(window, 'location', { value: { ...window.location, reload }, configurable: true });
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) => {
    if (type === 'error') listener = fn as (e: Event) => void;
    else add(type, fn, opts);
  });
  new Function(snippet)();
});

const fail = (tag: 'script' | 'link', url: string) => {
  const el = document.createElement(tag);
  if (tag === 'script') (el as HTMLScriptElement).src = url;
  else (el as HTMLLinkElement).href = url;
  listener?.({ target: el } as unknown as Event);
};

describe('reload on a missing hashed asset (index.html)', () => {
  it('reloads when a JS file in /assets/ is missing (it used to check href only)', () => {
    fail('script', 'https://formanova.ai/assets/index-OLD.js');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('still reloads for a missing CSS file', () => {
    fail('link', 'https://formanova.ai/assets/index-OLD.css');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('never loops: at most one reload a minute', () => {
    fail('script', 'https://formanova.ai/assets/a.js');
    fail('script', 'https://formanova.ai/assets/b.js');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ignores files outside /assets/', () => {
    fail('script', 'https://www.googletagmanager.com/gtag.js');
    expect(reload).not.toHaveBeenCalled();
  });
});
