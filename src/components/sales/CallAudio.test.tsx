import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render } from '@testing-library/react';
import { CallAudio } from './CallAudio';

/** Browser call recordings (MediaRecorder webm) carry no length, so a plain player shows 0:00 or ∞ and cannot seek. */
describe('CallAudio', () => {
  it('works out the length of a recording that has none, then starts from the beginning', () => {
    const { container } = render(<CallAudio src="blob:x" />);
    const audio = container.querySelector('audio') as HTMLAudioElement;
    let duration = Infinity;
    Object.defineProperty(audio, 'duration', { get: () => duration });
    fireEvent(audio, new Event('loadedmetadata'));
    expect(audio.currentTime).toBeGreaterThan(1e9); // makes the browser read to the end to find the length
    duration = 24.7;
    fireEvent(audio, new Event('durationchange'));
    expect(audio.currentTime).toBe(0);
  });

  it('leaves a recording with a known length alone', () => {
    const { container } = render(<CallAudio src="blob:y" />);
    const audio = container.querySelector('audio') as HTMLAudioElement;
    Object.defineProperty(audio, 'duration', { get: () => 24.7 });
    fireEvent(audio, new Event('loadedmetadata'));
    expect(audio.currentTime).toBe(0);
    expect(audio).toHaveAttribute('controls');
  });
});
