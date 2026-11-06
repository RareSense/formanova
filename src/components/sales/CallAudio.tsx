import { useRef } from 'react';

/**
 * A call recording player. Browser recordings (MediaRecorder webm) store no length, so a plain <audio>
 * shows 0:00 or ∞ and cannot seek. Jumping far ahead once makes the browser read to the end and learn
 * the real length; then playback goes back to the start (and starts, when autoPlay is set).
 */
export function CallAudio({ src, className, autoPlay = false }: { src: string; className?: string; autoPlay?: boolean }) {
  const finding = useRef(false);
  const start = (a: HTMLAudioElement) => {
    if (autoPlay) void a.play?.()?.catch?.(() => {});
  };
  return (
    <audio
      controls
      src={src}
      className={className}
      onLoadedMetadata={(e) => {
        const a = e.currentTarget;
        if (Number.isFinite(a.duration)) return start(a);
        finding.current = true;
        a.currentTime = 1e101;
      }}
      onDurationChange={(e) => {
        const a = e.currentTarget;
        if (finding.current && Number.isFinite(a.duration)) {
          finding.current = false;
          a.currentTime = 0;
          start(a);
        }
      }}
    />
  );
}
