/** Small display helpers for the call window (Eva's status line and captions). */
import type { CallTurn } from './webrtc-call';

/** Ruby's short listening sounds do not take over the caption (as on Eva's page). */
const CAPTION_SKIP = /^(mm+[- ]?hmm+|mm+|uh[- ]huh|hmm+|right|okay|ok|yeah)[.!,]?$/i;

export const formatClock = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/** The line being spoken now (Eva's captions): one turn, updated in place. */
export function currentCaption(turns: CallTurn[]): { turn: CallTurn; index: number } | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    const text = turns[i].text.trim();
    if (text.length > 1 && !(turns[i].role === 'ruby' && CAPTION_SKIP.test(text))) return { turn: turns[i], index: i };
  }
  return null;
}
