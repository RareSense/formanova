/**
 * The result action bar: what you do with the ring once it exists.
 *
 * It sits at the bottom center of the CAD viewport rather than in the toolbar
 * at the top, where the download used to live. The toolbar is about
 * manipulating the object (orbit, move, rotate, scale); this bar is about
 * finishing with it. Keeping the two apart stops the download from reading as
 * one more mode.
 *
 * Shared by both CAD workspaces (/image-to-cad and /text-to-cad), which render
 * it under the same condition the download carried before the move: a model is
 * loaded and nothing is generating.
 */

import { Sparkles } from 'lucide-react';

import { CadDownloadMenu, CAD_RESULT_ACTION_SIZE, CAD_RESULT_ACTION_WIDTH } from '@/components/downloads/CadDownloadMenu';
import { cn } from '@/lib/utils';

export interface CadResultActionsProps {
  /** Omit when the run has no .3dm, e.g. workflows predating ring_cad_nurbs_v1. */
  onDownloadThreedm?: () => void;
  /** Omit when the run has no GLB yet. */
  onDownloadGlb?: () => void;
  /** Omit when the version has no mesh-only viewing copy of the 3DM. */
  onDownloadViewerThreedm?: () => void;
  onDownloadStl?: () => void;
  onDownloadStep?: () => void;
  estimatedMetalMassG?: number | null;
  /** Omit unless the user has actually edited the model. */
  onExportEdited?: () => void;
  /** Disables the download while bytes are being fetched. */
  isBusy?: boolean;
  /**
   * The latest version's label, e.g. "V3". Omit when the run reports no
   * versions, which is every run today: the backend does not send them yet.
   * Without it the bar holds the download alone, at the same size it has
   * beside the Improve button, so versions arriving later do not move or
   * resize the control people already know.
   */
  latestVersionLabel?: string;
  /** Required for the Improve button to render, alongside latestVersionLabel. */
  onImproveFromVersion?: () => void;
  /** Grays Improve out and ignores presses: this version cannot be improved. */
  improveDisabled?: boolean;
  /**
   * The version's paid review left nothing to fix. Improve stays in its slot,
   * greyed out, and reads "Can't be improved" so the bar does not move.
   */
  improveExhausted?: boolean;
  /**
   * `overlay` (default) floats the bar over the bottom of the 3D view.
   * `row` is the phone dock: an in-flow row, both controls side by side at
   * one shared, shorter size, with labels short enough for a 320px screen.
   */
  layout?: 'overlay' | 'row';
  /**
   * The model came from the retired ring workflow. Same greyed "Can't be
   * improved" button, plus a visible note saying why (a disabled button shows
   * no tooltip on touch screens).
   */
  improveRetired?: boolean;
}

// Improve is where the eye should land, so it carries the filled treatment and
// the download beside it goes quiet. Both keep the same size, which is what
// stops the bar shifting on the day versions start arriving.
const IMPROVE_BASE =
  'flex items-center gap-2 border border-zinc-700 bg-zinc-950 text-white ' +
  'font-bold shadow-lg transition-opacity hover:opacity-90 active:scale-[0.98] ' +
  'disabled:pointer-events-none disabled:opacity-60';

/** Phone dock size: both buttons share it, so the pair stays equal. Overrides CAD_RESULT_ACTION_SIZE via tailwind-merge. */
export const CAD_RESULT_ACTION_ROW_SIZE = 'h-12 justify-center gap-2 rounded-lg px-3 text-[13px] tracking-normal';

export function CadResultActions({
  onDownloadThreedm,
  onDownloadGlb,
  onDownloadViewerThreedm,
  onDownloadStl,
  onDownloadStep,
  estimatedMetalMassG,
  onExportEdited,
  isBusy = false,
  latestVersionLabel,
  onImproveFromVersion,
  improveDisabled = false,
  improveExhausted = false,
  layout = 'overlay',
  improveRetired = false,
}: CadResultActionsProps) {
  const showImprove = Boolean(latestVersionLabel && onImproveFromVersion);

  if (layout === 'row') {
    const width = 'pointer-events-auto w-full min-w-0';
    return (
      <div className={cn('grid w-full gap-2', showImprove ? 'grid-cols-2' : 'grid-cols-1')}>
        {showImprove && improveRetired && (
          <p className="col-span-2 text-center text-[11px] leading-snug text-muted-foreground">
            Made with the older ring workflow. Start a new design to improve it.
          </p>
        )}
        {showImprove && (
          <button
            type="button"
            onClick={onImproveFromVersion}
            disabled={improveDisabled || improveExhausted || improveRetired}
            title={improveExhausted || improveRetired ? "Can't be improved" : `Improve from ${latestVersionLabel}`}
            className={cn(width, IMPROVE_BASE, CAD_RESULT_ACTION_ROW_SIZE)}
          >
            <Sparkles className="h-4 w-4 shrink-0" />
            <span className="truncate">{improveExhausted || improveRetired ? "Can't improve" : `Improve ${latestVersionLabel}`}</span>
          </button>
        )}
        <CadDownloadMenu
          variant="result"
          className={cn(width, CAD_RESULT_ACTION_ROW_SIZE)}
          isBusy={isBusy}
          onDownloadThreedm={onDownloadThreedm}
          onDownloadGlb={onDownloadGlb}
          onDownloadViewerThreedm={onDownloadViewerThreedm}
          onDownloadStl={onDownloadStl}
          onDownloadStep={onDownloadStep}
          estimatedMetalMassG={estimatedMetalMassG}
          onExportEdited={onExportEdited}
        />
      </div>
    );
  }

  return (
    // bottom-14 clears the gem toggle and the Ready indicator, which both sit
    // at bottom-4 and are 30px tall. px-4 keeps the bar off the viewport edges
    // once it wraps on a narrow panel.
    <div className="pointer-events-none absolute bottom-14 left-1/2 z-50 flex w-full -translate-x-1/2 flex-col items-center gap-3 px-4 sm:w-auto sm:flex-row sm:justify-center">
      {showImprove && improveRetired && (
        <p className="pointer-events-none absolute -top-8 left-1/2 w-max max-w-[min(92vw,22rem)] -translate-x-1/2 bg-zinc-950/85 px-3 py-1 text-center text-[11px] leading-snug text-white/85">
          Made with the older ring workflow. Start a new design to improve it.
        </p>
      )}
      {showImprove && (
        <button
          type="button"
          onClick={onImproveFromVersion}
          disabled={improveDisabled || improveExhausted || improveRetired}
          title={improveDisabled && !improveExhausted && !improveRetired ? 'This version cannot be improved' : undefined}
          className={cn('pointer-events-auto', CAD_RESULT_ACTION_WIDTH, IMPROVE_BASE, CAD_RESULT_ACTION_SIZE)}
        >
          <Sparkles className="h-[18px] w-[18px] shrink-0" />
          {improveExhausted || improveRetired ? "Can't be improved" : `Improve from ${latestVersionLabel}`}
        </button>
      )}
      <CadDownloadMenu
        variant="result"
        className={cn('pointer-events-auto', CAD_RESULT_ACTION_WIDTH)}
        isBusy={isBusy}
        onDownloadThreedm={onDownloadThreedm}
        onDownloadGlb={onDownloadGlb}
        onDownloadViewerThreedm={onDownloadViewerThreedm}
        onDownloadStl={onDownloadStl}
        onDownloadStep={onDownloadStep}
        estimatedMetalMassG={estimatedMetalMassG}
        onExportEdited={onExportEdited}
      />
    </div>
  );
}

export default CadResultActions;
