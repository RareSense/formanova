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
}

// Improve is where the eye should land, so it carries the filled treatment and
// the download beside it goes quiet. Both keep the same size, which is what
// stops the bar shifting on the day versions start arriving.
const IMPROVE_BASE =
  'flex items-center gap-2 border border-primary bg-primary text-primary-foreground ' +
  'font-bold shadow-lg transition-opacity hover:opacity-90 active:scale-[0.98] ' +
  'disabled:pointer-events-none disabled:opacity-60';

export function CadResultActions({
  onDownloadThreedm,
  onDownloadGlb,
  onExportEdited,
  isBusy = false,
  latestVersionLabel,
  onImproveFromVersion,
}: CadResultActionsProps) {
  const showImprove = Boolean(latestVersionLabel && onImproveFromVersion);

  return (
    // bottom-14 clears the gem toggle and the Ready indicator, which both sit
    // at bottom-4 and are 30px tall. px-4 keeps the bar off the viewport edges
    // once it wraps on a narrow panel.
    <div className="pointer-events-none absolute bottom-14 left-1/2 z-50 flex w-full -translate-x-1/2 flex-col items-center gap-3 px-4 sm:w-auto sm:flex-row sm:justify-center">
      {showImprove && (
        <button
          type="button"
          onClick={onImproveFromVersion}
          className={cn('pointer-events-auto', CAD_RESULT_ACTION_WIDTH, IMPROVE_BASE, CAD_RESULT_ACTION_SIZE)}
        >
          <Sparkles className="h-[18px] w-[18px] shrink-0" />
          {`Improve from ${latestVersionLabel}`}
        </button>
      )}
      <CadDownloadMenu
        variant="result"
        className={cn('pointer-events-auto', CAD_RESULT_ACTION_WIDTH)}
        isBusy={isBusy}
        onDownloadThreedm={onDownloadThreedm}
        onDownloadGlb={onDownloadGlb}
        onExportEdited={onExportEdited}
      />
    </div>
  );
}

export default CadResultActions;
