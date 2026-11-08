import { describe, it, expect, afterEach } from 'vitest';
import { isHeyCatchHost, dropAdminEvents } from './heycatch-config';

describe('isHeyCatchHost', () => {
  it('counts the live site only', () => {
    expect(isHeyCatchHost('formanova.ai')).toBe(true);
    expect(isHeyCatchHost('FormaNova.ai')).toBe(true);
  });

  it('leaves out staging, local dev and other hosts', () => {
    for (const host of ['staging.formanova.ai', 'www.formanova.ai', 'localhost', '127.0.0.1', '192.168.1.20', 'formanova.lovable.app', '']) {
      expect(isHeyCatchHost(host)).toBe(false);
    }
  });
});

describe('dropAdminEvents', () => {
  const event = (url?: string) => ({ event: '$autocapture', properties: url ? { $current_url: url } : {} });

  afterEach(() => window.history.replaceState(null, '', '/'));

  it('drops events from admin pages, where other customers’ emails are on screen', () => {
    for (const path of ['/admin', '/admin/brands', '/admin/ruby-calls', '/admin/ruby-orders', '/admin/generations/abc']) {
      expect(dropAdminEvents(event(`https://formanova.ai${path}?q=1`))).toBeNull();
    }
  });

  it('keeps events from every other page', () => {
    for (const path of ['/', '/pricing', '/dashboard', '/studio/rings', '/administrator', '/admins']) {
      const e = event(`https://formanova.ai${path}`);
      expect(dropAdminEvents(e)).toBe(e);
    }
  });

  it('falls back to the current page when the event has no URL', () => {
    window.history.replaceState(null, '', '/admin/brands');
    expect(dropAdminEvents(event())).toBeNull();
    window.history.replaceState(null, '', '/pricing');
    const e = event();
    expect(dropAdminEvents(e)).toBe(e);
  });

  it('passes on an event an earlier hook already dropped', () => {
    expect(dropAdminEvents(null)).toBeNull();
  });
});
