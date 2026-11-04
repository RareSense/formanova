/**
 * Where the FormaNova creative team may reach the client with shoot questions. Text channels only
 * (owner, 2026-11-04): the field on screen matches the channel the client picked, and what they type
 * is saved straight into the lead, so it is kept even if the model forgets to save it.
 */
export const REACH_CHANNELS = ['whatsapp', 'imessage', 'sms', 'instagram', 'email'] as const;
export type ReachChannel = (typeof REACH_CHANNELS)[number];

export const isReachChannel = (v: unknown): v is ReachChannel =>
  typeof v === 'string' && (REACH_CHANNELS as readonly string[]).includes(v);

const NAMES: Record<ReachChannel, string> = {
  whatsapp: 'WhatsApp',
  imessage: 'iMessage',
  sms: 'Text message',
  instagram: 'Instagram',
  email: 'Email',
};

export interface ReachFieldSpec {
  name: string;
  label: string;
  placeholder: string;
  inputMode: 'tel' | 'email' | 'text';
}

const NUMBER = (name: string): ReachFieldSpec => ({
  name,
  label: `Your ${name} number, with the country code`,
  placeholder: '+44 7700 900123',
  inputMode: 'tel',
});

export function reachField(channel: ReachChannel): ReachFieldSpec {
  if (channel === 'instagram') return { name: NAMES.instagram, label: 'Your Instagram handle', placeholder: '@yourbrand', inputMode: 'text' };
  if (channel === 'email') return { name: NAMES.email, label: 'Your email', placeholder: 'you@yourbrand.com', inputMode: 'email' };
  return NUMBER(NAMES[channel]);
}

/** E.164: a + and the country code, 8 to 15 digits in all. */
const PHONE = /^\+[1-9]\d{7,14}$/;
const HANDLE = /^[A-Za-z0-9._]{1,30}$/;
const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;

/** The cleaned value, or null when it is not a usable contact for that channel. */
export function normalizeReach(channel: ReachChannel, raw: string): string | null {
  const text = raw.trim();
  if (channel === 'instagram') {
    const handle = text.startsWith('@') ? text.slice(1) : text;
    return HANDLE.test(handle) ? `@${handle}` : null;
  }
  if (channel === 'email') {
    const email = text.toLowerCase();
    return EMAIL.test(email) ? email : null;
  }
  const phone = text.replace(/[\s\-().]/g, '');
  return PHONE.test(phone) ? phone : null;
}

/** The lead fields to save for a value normalizeReach accepted. */
export function reachLead(channel: ReachChannel, value: string): Record<string, string> {
  const field = channel === 'instagram' ? 'instagram' : channel === 'email' ? 'email' : 'phone';
  return { [field]: value, contact_preference: `${NAMES[channel]} ${value}` };
}

/** What Ruby is told once the client has shared it. */
export function reachMessage(channel: ReachChannel, value: string): string {
  return `The client shared where the creative team can reach them, ${NAMES[channel]}: ${value}. It is saved. Read it back once to confirm, thank them briefly and continue.`;
}
