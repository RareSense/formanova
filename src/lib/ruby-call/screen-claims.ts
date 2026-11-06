/**
 * Owner, 2026-11-06: Ruby sometimes says "it's on your screen" when nothing new is there. The page knows what it
 * really showed, so it checks her words: a sentence that says something is (now) on the screen, while nothing new
 * was shown since the caller last spoke, gets her a note to correct herself and actually show it.
 */

const SCREEN = /\bscreen\b/i;
/** Says something is there now: "I've put", "it's on", "is now up on", "done". */
const PLACED = /\b(i'?ve|i have|i just|i put|i added|i pulled|i brought|it'?s|it is|that'?s|they'?re|it'?s now|now|done|up on)\b/i;
/** "It's not on your screen yet", "can you see it on your screen?": not a claim. */
const NOT_A_CLAIM = /\b(not|isn'?t|aren'?t|yet|once|when|will|going to|can you|do you|could you)\b/i;

/** True when a sentence of Ruby's says something is on the caller's screen now. */
export function claimsOnScreen(text: string): boolean {
  return text
    .split(/(?<=[.!?])\s+/)
    .some((s) => SCREEN.test(s) && PLACED.test(s) && !NOT_A_CLAIM.test(s));
}

export const SCREEN_CLAIM_NOTE =
  "Note for this moment only: nothing new has been put on the caller's screen since they last spoke. If you just told them something new is on their screen, say in one short sentence that it is not up yet and ask the backend to show it now; say it is there only once the backend confirms. If you meant what was already on screen before, say nothing about this. Do not mention this note.";

/** Waits this long after the claim, so a panel that is still rendering counts. */
export const SCREEN_CLAIM_GRACE_MS = 2500;

export interface ScreenClaimState {
  /** When the caller last spoke (ms). */
  lastClientAt: number;
  /** When a panel last rendered on screen (ms), 0 if never. */
  lastShownAt: number;
  /** A tool is still running: it may be about to show the thing. */
  busy: boolean;
}

/** After the grace period: should Ruby be told her claim was false? */
export function falseScreenClaim(s: ScreenClaimState): boolean {
  return !s.busy && s.lastShownAt < s.lastClientAt;
}
