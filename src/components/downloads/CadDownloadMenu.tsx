/**
 * The single CAD download control, shared by the CAD workspaces and the
 * generations history card.
 *
 * It lives outside `components/cad*` deliberately: the generations history is
 * not a CAD feature and must not import from those folders (CLAUDE.md module
 * boundaries), so a control both sides need cannot live inside one of them.
 *
 * Why a split button rather than two buttons: the backend produces a `.3dm`
 * and a `.glb` for every run and both are real deliverables, but they are not
 * peers. The `.3dm` is the machinable NURBS file people came for; the `.glb`
 * is the preview mesh. So the chevron decides which is one click and which is
 * two, never which one exists.
 */

import { Download, ChevronDown } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface CadDownloadMenuProps {
  /** Omit when the run has no .3dm, e.g. workflows predating ring_cad_nurbs_v1. */
  onDownloadThreedm?: () => void;
  /** Omit when the run has no GLB yet. */
  onDownloadGlb?: () => void;
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
   * full-width variant used in the history list.
   *
   * Both are solid. The history card previously used an outline style so two
   * filled blocks would not compete with the ring preview above them, which
   * was a fair concern, but in dark mode that is a 20%-lightness border on a
   * 5%-lightness surface and the button all but disappears. Only the download
   * is promoted; Open in Studio stays outlined, so there is one clear primary
   * action rather than the two the original note was guarding against.
   */
  variant?: 'viewport' | 'card';
  className?: string;
}

const TRIGGER_BASE =
  'flex items-center gap-2 border border-primary bg-primary text-primary-foreground ' +
  'font-bold uppercase shadow-lg transition-opacity hover:opacity-90 active:scale-[0.98] ' +
  'disabled:pointer-events-none disabled:opacity-60';

const VARIANTS = {
  // 42px, not 40, so this lines up with the mode group in the same toolbar.
  // Those buttons are h-[40px] inside a container that adds its own 1px border
  // top and bottom, making the group 42px outside. This control carries its
  // border on the button itself, and box-sizing is border-box, so h-[40px]
  // would render 40px total and sit 2px short at the bottom.
  viewport: 'h-[42px] px-4 text-[11px] tracking-[0.12em]',
  // flex-1, not w-full: the chevron is a sibling inside the same row, so a
  // full-width primary would push it out of the card.
  card: 'h-11 w-full flex-1 justify-center px-3 font-mono text-[9px] tracking-wider',
} as const;

export function CadDownloadMenu({
  onDownloadThreedm,
  onDownloadGlb,
  onExportEdited,
  isBusy = false,
  variant = 'viewport',
  className,
}: CadDownloadMenuProps) {
  // The .3dm leads when it exists. Older runs that only ever produced a GLB
  // fall back to it rather than rendering a default action that does nothing.
  const primaryAction = onDownloadThreedm ?? onDownloadGlb;
  if (!primaryAction) return null;

  const primaryLabel = onDownloadThreedm ? 'Download 3DM' : 'Download GLB';

  // Everything not already the default action. A menu holding a single entry
  // is a dead affordance, so the chevron only appears when it has contents.
  const menuItems: { label: string; onSelect: () => void }[] = [];
  if (onDownloadThreedm && onDownloadGlb) {
    menuItems.push({ label: 'Download GLB', onSelect: onDownloadGlb });
  }
  if (onExportEdited) {
    menuItems.push({ label: 'Export GLB with my edits', onSelect: onExportEdited });
  }

  return (
    <div className={cn('flex items-stretch', variant === 'card' && 'w-full', className)}>
      <button
        type="button"
        onClick={primaryAction}
        disabled={isBusy}
        className={cn(
          TRIGGER_BASE,
          VARIANTS[variant],
          menuItems.length > 0 && 'border-r-0',
        )}
      >
        <Download className="h-3.5 w-3.5 shrink-0" />
        {isBusy ? 'Preparing...' : primaryLabel}
      </button>

      {menuItems.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="More download options"
              disabled={isBusy}
              className={cn(
                TRIGGER_BASE,
                'justify-center px-2',
                variant === 'viewport' ? 'h-[42px]' : 'h-11',
                // A hairline keeps the two halves readable as one control
                // without letting the divider read as a gap between siblings.
                'border-l border-l-primary-foreground/25',
              )}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[13rem]">
            {menuItems.map(item => (
              <DropdownMenuItem
                key={item.label}
                onSelect={item.onSelect}
                className="font-mono text-[10px] uppercase tracking-wider py-2"
              >
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
