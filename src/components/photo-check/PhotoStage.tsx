import type { Box } from '@/lib/photo-check/analyze';

/**
 * The photo with thin grey guide lines, like a camera's grid: a solid outline
 * around the piece and, when the marketplace has a fill rule, a dashed square
 * showing how large the piece should be.
 */
export function PhotoStage({ src, width, height, box, minFill }: {
  src: string;
  width: number;
  height: number;
  box: Box | null;
  minFill?: number;
}) {
  const side = minFill !== undefined ? minFill * Math.min(width, height) : 0;
  return (
    <figure className="m-0">
      <div className="relative mx-auto w-full bg-muted/40" style={{ aspectRatio: `${width} / ${height}`, maxHeight: '60vh' }}>
        <img src={src} alt="Your jewelry photo" className="absolute inset-0 h-full w-full object-contain" />
        {box && (
          <div
            aria-hidden="true"
            className="absolute border border-foreground/50"
            style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
          />
        )}
        {minFill !== undefined && (
          <div
            aria-hidden="true"
            className="absolute border border-dashed border-foreground/30"
            style={{
              left: `${50 - (side / width) * 50}%`,
              top: `${50 - (side / height) * 50}%`,
              width: `${(side / width) * 100}%`,
              height: `${(side / height) * 100}%`,
            }}
          />
        )}
      </div>
    </figure>
  );
}
