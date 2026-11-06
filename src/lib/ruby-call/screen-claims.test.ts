import { describe, it, expect } from 'vitest';
import { claimsOnScreen, falseScreenClaim } from './screen-claims';

describe('claimsOnScreen', () => {
  it.each([
    "Done, it's on your screen.",
    "I've put the payment link on your screen.",
    'The payment link is on your screen now for the deposit.',
    "Okay, I put standard beside Express on your screen.",
    "It's up on your screen now.",
  ])('a claim: %s', (text) => expect(claimsOnScreen(text)).toBe(true));

  it.each([
    "It's not on your screen yet.",
    'Can you see the pay now button on your screen?',
    "I'll put it on your screen once it's ready.",
    'One moment, getting your price.',
    'Your total is two hundred eighty five dollars.',
  ])('not a claim: %s', (text) => expect(claimsOnScreen(text)).toBe(false));
});

describe('falseScreenClaim', () => {
  it('nothing shown since the caller spoke: false claim', () => {
    expect(falseScreenClaim({ lastClientAt: 100, lastShownAt: 50, busy: false })).toBe(true);
  });
  it('a panel rendered after the caller spoke: true claim', () => {
    expect(falseScreenClaim({ lastClientAt: 100, lastShownAt: 150, busy: false })).toBe(false);
  });
  it('a tool is still running: wait, do not correct', () => {
    expect(falseScreenClaim({ lastClientAt: 100, lastShownAt: 50, busy: true })).toBe(false);
  });
});
