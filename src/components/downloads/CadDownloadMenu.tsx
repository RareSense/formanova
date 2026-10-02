/**
 * The single CAD download control, shared by the CAD workspaces and the
 * generations history card.
 *
 * It lives outside `components/cad*` deliberately: the generations history is
 * not a CAD feature and must not import from those folders (CLAUDE.md module
 * boundaries), so a control both sides need cannot live inside one of them.
 *
 * One button that opens a list of formats, rather than a one-click default:
 * jewellers pick the file for the job (Rhino, preview, printing, other CAD),
 * so every format is named with a short hint and none is downloaded by a
 * stray click. The editable NURBS .3dm still leads the list.
 */

import { Download, ChevronDown } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface CadDownloadMenuProps {
  /** Omit when the run has no .3dm, e.g. workflows predating ring_cad_nurbs_v1. */
  onDownloadThreedm?: () => void;
  /** Omit when the run has no GLB yet. */
  onDownloadGlb?: () => void;
  onDownloadStl?: () => void;
  onDownloadStep?: () => void;
  estimatedMetalMassG?: number | null;
  /**
   * Omit when the version has no viewing copy. A mesh-only 3DM for generic
   * viewers, never the default action: the editable NURBS 3DM stays the lead.
   */
  onDownloadViewerThreedm?: () => void;
  /**
   * Omit unless the user has actually edited the model. Passing it
   * unconditionally would offer an export that is byte-identical to the plain
   * GLB, which reads as two options that do the same thing.
   */
  onExportEdited?: () => void;
  /** Disables the default action while bytes are being fetched. */
  isBusy?: boolean;
  /**
   * `viewport` is the overlay button in the 3D workspace; `card` is the
   * full-width variant used in the history list; `result` is the large one in
   * the result action bar at the bottom of the CAD viewport.
   *
   * Both are solid. The history card previously used an outline style so two
   * filled blocks would not compete with the ring preview above them, which
   * was a fair concern, but in dark mode that is a 20%-lightness border on a
   * 5%-lightness surface and the button all but disappears. Only the download
   * is promoted; Open in Studio stays outlined, so there is one clear primary
   * action rather than the two the original note was guarding against.
   */
  variant?: 'viewport' | 'card' | 'result';
  className?: string;
}

const TRIGGER_BASE =
  'flex items-center gap-2 border font-bold shadow-lg ' +
  'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60';

/**
 * The result download stays light independently of the application theme.
 */
const TRIGGER_TONES = {
  filled: 'border-primary bg-primary text-primary-foreground transition-opacity hover:opacity-90',
  quiet: 'border-zinc-300 bg-white text-zinc-950 transition-colors hover:bg-zinc-100',
} as const;

/**
 * The size every control in the result action bar shares.
 *
 * Exported rather than duplicated: the bar's other control (Improve from the
 * latest version) is a sibling of this one, and CLAUDE.md requires siblings to
 * be the same size. Two hand-kept copies of the same measurements drift the
 * first time one of them is adjusted, so both read it from here.
 */
export const CAD_RESULT_ACTION_SIZE =
  'h-[56px] justify-center gap-3 rounded-lg px-6 text-[15px] tracking-normal';

/**
 * The width both controls in the result bar take.
 *
 * Set here rather than left to each label so both controls stay the same
 * width. Full width when the bar stacks on a narrow panel.
 */
export const CAD_RESULT_ACTION_WIDTH = 'w-full sm:w-[264px]';

const VARIANTS = {
  // 42px, not 40, so this lines up with the mode group in the same toolbar.
  // Those buttons are h-[40px] inside a container that adds its own 1px border
  // top and bottom, making the group 42px outside. This control carries its
  // border on the button itself, and box-sizing is border-box, so h-[40px]
  // would render 40px total and sit 2px short at the bottom.
  viewport: 'h-[42px] px-4 text-[11px] uppercase tracking-[0.12em]',
  card: 'h-11 w-full justify-center px-3 font-mono text-[9px] uppercase tracking-wider',
  // The finished-result action at the bottom of the viewport. Larger than
  // `viewport` because it is no longer one control among the tools: it is the
  // end of the job, shown once the object is there to download.
  // Width comes from the caller (CAD_RESULT_ACTION_WIDTH). No flex-1: in a
  // column container it would override the explicit height.
  result: CAD_RESULT_ACTION_SIZE,
} as const;

interface FormatRow {
  format: string;
  hint: string;
  onSelect: () => void;
}

export function CadDownloadMenu({
  onDownloadThreedm,
  onDownloadGlb,
  onDownloadViewerThreedm,
  onDownloadStl,
  onDownloadStep,
  estimatedMetalMassG,
  onExportEdited,
  isBusy = false,
  variant = 'viewport',
  className,
}: CadDownloadMenuProps) {
  // STL, STEP and the viewing copy are only ever produced alongside a 3DM or
  // GLB, so a run with neither has nothing to offer.
  if (!onDownloadThreedm && !onDownloadGlb) return null;

  // Fixed light download beside fixed dark Improve, in every theme.
  const tone = variant === 'result' ? 'quiet' : 'filled';

  // Fixed order: the editable file first, then preview, viewer copy, and the
  // exchange formats. Only formats this run actually has are listed.
  const formats: FormatRow[] = [];
  if (onDownloadThreedm) formats.push({ format: '3DM', hint: 'Rhino, editable', onSelect: onDownloadThreedm });
  if (onDownloadGlb) formats.push({ format: 'GLB', hint: '3D preview', onSelect: onDownloadGlb });
  if (onDownloadViewerThreedm) formats.push({ format: '3DM', hint: 'Viewer only (mesh)', onSelect: onDownloadViewerThreedm });
  if (onDownloadStep) formats.push({ format: 'STEP', hint: 'Other CAD software', onSelect: onDownloadStep });
  if (onDownloadStl) formats.push({ format: 'STL', hint: '3D printing', onSelect: onDownloadStl });

  const iconSize = variant === 'result' ? 'h-[18px] w-[18px]' : 'h-3.5 w-3.5';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={isBusy}>
        <button
          type="button"
          disabled={isBusy}
          className={cn(TRIGGER_BASE, TRIGGER_TONES[tone], VARIANTS[variant], className)}
        >
          <Download aria-hidden="true" className={cn('shrink-0', iconSize)} />
          <span>{isBusy ? 'Preparing...' : 'Download'}</span>
          <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[15rem]">
        {typeof estimatedMetalMassG === 'number' && (
          <div className="px-2 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Est. metal weight: {estimatedMetalMassG.toFixed(2)} g
          </div>
        )}
        {formats.map((row) => (
          <DropdownMenuItem key={`${row.format}-${row.hint}`} onSelect={row.onSelect} className="gap-3 py-2">
            <span className="w-10 shrink-0 font-mono text-[11px] font-semibold uppercase tracking-wider">{row.format}</span>
            <span className="text-[12px] text-muted-foreground">{row.hint}</span>
          </DropdownMenuItem>
        ))}
        {onExportEdited && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onExportEdited} className="gap-3 py-2">
              <span className="w-10 shrink-0 font-mono text-[11px] font-semibold uppercase tracking-wider">GLB</span>
              <span className="text-[12px] text-muted-foreground">With my edits</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
