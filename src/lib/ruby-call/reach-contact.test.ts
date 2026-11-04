import { describe, expect, it } from 'vitest';
import { REACH_CHANNELS, normalizeReach, reachField, reachLead, reachMessage } from './reach-contact';

describe('reach contact', () => {
  it('offers text channels only: WhatsApp, iMessage, text message, Instagram and email', () => {
    expect(REACH_CHANNELS).toEqual(['whatsapp', 'imessage', 'sms', 'instagram', 'email']);
  });

  it('asks for a number with the country code on WhatsApp, iMessage and text message', () => {
    for (const channel of ['whatsapp', 'imessage', 'sms'] as const) {
      expect(reachField(channel).label).toMatch(/country code/i);
      expect(reachField(channel).inputMode).toBe('tel');
    }
    expect(reachField('instagram').label).toMatch(/handle/i);
    expect(reachField('email').inputMode).toBe('email');
  });

  it('keeps a number only with its country code, without spaces or dashes', () => {
    expect(normalizeReach('whatsapp', ' +44 7700-900 123 ')).toBe('+447700900123');
    expect(normalizeReach('sms', '(+1) 415 555 0100')).toBe('+14155550100');
    expect(normalizeReach('whatsapp', '07700 900123')).toBeNull(); // no country code
    expect(normalizeReach('imessage', '+12')).toBeNull(); // too short
    expect(normalizeReach('sms', '+44 77oo 900')).toBeNull(); // letters
  });

  it('keeps an Instagram handle with one @, and refuses anything else', () => {
    expect(normalizeReach('instagram', 'ruby.jewels_')).toBe('@ruby.jewels_');
    expect(normalizeReach('instagram', '@@ruby')).toBeNull();
    expect(normalizeReach('instagram', '@Ruby Jewels')).toBeNull();
    expect(normalizeReach('instagram', 'instagram.com/ruby')).toBeNull();
  });

  it('keeps a plain email in lower case', () => {
    expect(normalizeReach('email', ' Owner@Brand.com ')).toBe('owner@brand.com');
    expect(normalizeReach('email', 'owner@brand')).toBeNull();
    expect(normalizeReach('email', '<b>x</b>@brand.com')).toBeNull();
  });

  it('saves the value in the matching lead field with the preferred channel', () => {
    expect(reachLead('whatsapp', '+447700900123')).toEqual({ phone: '+447700900123', contact_preference: 'WhatsApp +447700900123' });
    expect(reachLead('instagram', '@ruby')).toEqual({ instagram: '@ruby', contact_preference: 'Instagram @ruby' });
    expect(reachLead('email', 'a@b.co')).toEqual({ email: 'a@b.co', contact_preference: 'Email a@b.co' });
  });

  it('tells Ruby what was shared, so she reads it back', () => {
    expect(reachMessage('imessage', '+14155550100')).toContain('iMessage: +14155550100');
    expect(reachMessage('imessage', '+14155550100')).toMatch(/read it back/i);
  });
});
