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
import { toast } from 'sonner';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { AuthExpiredError } from '@/lib/authenticated-fetch';
import type { CadSource } from '@/lib/cad-analytics';
import {
  CadDownloadUnavailableError,
  fetchVersionDownloadLink,
  type CadDownloadKind,
  type CadVersionDownload,
} from '@/lib/cad-versions-api';
import { trackDownloadClicked } from '@/lib/posthog-events';

/**
 * The files the shown version lists as complete (GET /api/cad/models). Each is
 * fetched through a fresh, short-lived link at the moment it is chosen.
 */
export interface CadVersionDownloads {
  assetId: string;
  downloads: CadVersionDownload[];
  source?: CadSource;
  /** Open Review required flags on the spec sheet, shown beside it; omit when the version sends none. */
  specSheetOpenFlags?: number | null;
}

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
  /** Disables the Download button while a file is being prepared. */
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
  /**
   * The shown version's complete files. Their items follow today's; a version
   * STL or STEP replaces the run's item of the same kind, and a version 3DM is
   * listed only when there is no Rhino item already.
   */
  versionDownloads?: CadVersionDownloads | null;
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
  /** A short note after the hint, e.g. the spec sheet's open flags. */
  note?: string;
}

/** What each version file is called in the list. The 3DM keeps the Rhino hint used above. */
const VERSION_FILE_LABELS: Record<CadDownloadKind, string> = {
  threedm: 'Rhino, editable',
  stl: 'Full model STL – with stones, for viewing and CAD',
  step: 'Full model STEP – with stones, for viewing and CAD',
  casting_stl: 'Casting STL – send to your caster',
  stones: 'Stone list',
  spec_sheet: 'Spec sheet – for jeweller review',
};

/**
 * The short format shown beside a version file: its extension, e.g. CSV for
 * the stone list. A name with no extension, or one too long for the column,
 * reads LIST.
 */
function formatOfFile(filename: string | undefined): string {
  const name = filename ?? '';
  const ext = name.includes('.') ? name.split('.').pop()?.toUpperCase() ?? '' : '';
  return ext && ext.length <= 4 ? ext : 'LIST';
}

const VERSION_FILE_ORDER: CadDownloadKind[] = ['threedm', 'stl', 'step', 'casting_stl', 'stones', 'spec_sheet'];

/** Pause between files in Download all, so the browser takes each one as its own download. */
const DOWNLOAD_ALL_GAP_MS = 400;

/**
 * Asks for a fresh link and follows it. The link carries the filename, so the
 * browser saves the file itself; nothing is cached, since links expire.
 */
async function saveVersionFile(assetId: string, kind: CadDownloadKind, source?: CadSource) {
  try {
    const link = await fetchVersionDownloadLink(assetId, kind);
    const anchor = document.createElement('a');
    anchor.href = link.url;
    anchor.download = link.filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    trackDownloadClicked({ file_name: link.filename, file_type: kind, context: source, source });
  } catch (err) {
    if (err instanceof AuthExpiredError) return;
    toast.error(err instanceof CadDownloadUnavailableError
      ? "That file isn't available for this model."
      : "Couldn't get the download link. Try again.");
  }
}

function FormatItem({ format, hint, onSelect, note }: FormatRow) {
  return (
    <DropdownMenuItem onSelect={onSelect} className="gap-3 py-2">
      <span className="w-10 shrink-0 font-mono text-[11px] font-semibold uppercase tracking-wider">{format}</span>
      <span className="text-[12px] text-muted-foreground">{hint}</span>
      {note && (
        <span className="ml-auto shrink-0 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] tabular-nums">
          {note}
        </span>
      )}
    </DropdownMenuItem>
  );
}

function openFlagsNote(count: number | null | undefined): string | undefined {
  if (typeof count !== 'number') return undefined;
  return `${count} open flag${count === 1 ? '' : 's'}`;
}

/** Every listed version file, one fresh link at a time, with a short pause between saves. */
async function saveAllVersionFiles(assetId: string, kinds: CadDownloadKind[], source?: CadSource) {
  for (const [index, kind] of kinds.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_ALL_GAP_MS));
    await saveVersionFile(assetId, kind, source);
  }
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
  versionDownloads,
}: CadDownloadMenuProps) {
  // One entry per kind, in a fixed order, whatever order the list arrives in.
  const versionKinds = new Set((versionDownloads?.downloads ?? []).map((file) => file.kind));
  const versionFiles = VERSION_FILE_ORDER.filter((kind) => versionKinds.has(kind));

  // STL, STEP and the viewing copy are only ever produced alongside a 3DM or
  // GLB, so a run with neither (and no complete version files) has nothing to offer.
  if (!onDownloadThreedm && !onDownloadGlb && versionFiles.length === 0) return null;

  // Fixed light download beside fixed dark Improve, in every theme.
  const tone = variant === 'result' ? 'quiet' : 'filled';

  // Fixed order: the editable file first, then preview, viewer copy, and the
  // exchange formats. Only formats this run actually has are listed.
  const formats: FormatRow[] = [];
  if (onDownloadThreedm) formats.push({ format: '3DM', hint: 'Rhino, editable', onSelect: onDownloadThreedm });
  if (onDownloadGlb) formats.push({ format: 'GLB', hint: '3D preview', onSelect: onDownloadGlb });
  if (onDownloadViewerThreedm) formats.push({ format: '3DM', hint: 'Viewer only (mesh)', onSelect: onDownloadViewerThreedm });
  if (onDownloadStep && !versionKinds.has('step')) formats.push({ format: 'STEP', hint: 'Other CAD software', onSelect: onDownloadStep });
  if (onDownloadStl && !versionKinds.has('stl')) formats.push({ format: 'STL', hint: '3D printing', onSelect: onDownloadStl });
  // The version's own files follow, one item per kind. Today's Rhino item
  // stays the 3DM whenever it exists.
  for (const kind of versionFiles) {
    if (kind === 'threedm' && onDownloadThreedm) continue;
    formats.push({
      format: formatOfFile(versionDownloads.downloads.find((file) => file.kind === kind)?.filename),
      hint: VERSION_FILE_LABELS[kind],
      onSelect: () => { void saveVersionFile(versionDownloads.assetId, kind, versionDownloads.source); },
      note: kind === 'spec_sheet' ? openFlagsNote(versionDownloads.specSheetOpenFlags) : undefined,
    });
  }
  // Download all arrives with the spec sheet, so a version without one keeps today's list exactly.
  const downloadAll = versionKinds.has('spec_sheet')
    ? () => { void saveAllVersionFiles(versionDownloads.assetId, versionFiles, versionDownloads.source); }
    : null;

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
          <FormatItem key={`${row.format}-${row.hint}`} {...row} />
        ))}
        {downloadAll && <FormatItem format="ALL" hint="Download all" onSelect={downloadAll} />}
        {onExportEdited && (
          <>
            <DropdownMenuSeparator />
            <FormatItem format="GLB" hint="With my edits" onSelect={onExportEdited} />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
