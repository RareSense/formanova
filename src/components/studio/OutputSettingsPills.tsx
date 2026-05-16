import React from 'react';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export const ASPECT_RATIOS = ['3:4', '4:5', '1:1', '9:16', '4:3', '3:2', '2:3', '16:9', '5:4', '21:9'];

export type Resolution = '1K' | '2K' | '4K';

export const RESOLUTION_COSTS: Record<Resolution, number> = {
  '1K': 10,
  '2K': 15,
  '4K': 25,
};

const RESOLUTION_LABELS: Record<Resolution, { short: string; full: string }> = {
  '1K': { short: '1K', full: 'Standard HD' },
  '2K': { short: '2K', full: 'High Res' },
  '4K': { short: '4K', full: 'Ultra HD' },
};

// Normalised rect coords (x,y,w,h) inside a 16x16 viewBox.
// Each ratio is scaled so its longest side = 12, then centred.
const FRAME_RECTS: Record<string, [number, number, number, number]> = {
  '1:1':  [2, 2, 12, 12],
  '16:9': [2, 5, 12, 7],
  '9:16': [5, 2, 7, 12],
  '4:3':  [2, 4, 12, 9],
  '3:4':  [4, 2, 9, 12],
  '2:3':  [4, 2, 8, 12],
  '3:2':  [2, 4, 12, 8],
  '4:5':  [3, 2, 10, 12],
  '5:4':  [2, 3, 12, 10],
  '21:9': [2, 6, 12, 5],
};

function FrameIcon({ ratio, active }: { ratio: string; active: boolean }) {
  const r = FRAME_RECTS[ratio] ?? [2, 2, 12, 12];
  return (
    <svg
      viewBox="0 0 16 16"
      width={16}
      height={16}
      fill="none"
      className="flex-shrink-0"
      aria-hidden
    >
      <rect
        x={r[0]}
        y={r[1]}
        width={r[2]}
        height={r[3]}
        rx={0.5}
        stroke="currentColor"
        strokeWidth={1.2}
        className={active ? 'text-primary' : 'text-muted-foreground/50'}
      />
    </svg>
  );
}

// Pill base — min-w sized to widest trigger content ("Frame 21:9 ▾" on xl, "21:9 ▾" below xl)
// Width sized to largest trigger content per pill type.
// AspectRatioPill: "21:9" / "Frame 21:9"
// ResolutionPill:  "4K"   / "Res 4K"
// Both use the same base class; widths are applied per-component via className.
const PILL_BASE =
  'h-11 flex items-center justify-between gap-1.5 px-3 rounded-md border border-primary/60 bg-background ' +
  'hover:border-primary transition-colors font-mono text-sm ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

const PILL_WIDTH = 'w-[7rem]';

interface AspectRatioPillProps {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

export function AspectRatioPill({ value, onChange, className }: AspectRatioPillProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-haspopup="listbox" className={`${PILL_BASE} ${PILL_WIDTH} ${className ?? ''}`}>
          <span className="flex-1 flex items-center justify-center gap-1.5">
            <FrameIcon ratio={value} active />
            <span className="text-foreground font-medium whitespace-nowrap">{value}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40 max-h-60 overflow-y-auto bg-popover border-border">
        {ASPECT_RATIOS.map((ratio) => {
          const active = ratio === value;
          return (
            <DropdownMenuItem
              key={ratio}
              onClick={() => onChange(ratio)}
              className={`font-mono text-sm gap-2 ${active ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
            >
              <FrameIcon ratio={ratio} active={active} />
              <span className="flex-1">{ratio}</span>
              {active && <span className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ResolutionPillProps {
  value: Resolution;
  onChange: (v: Resolution) => void;
  className?: string;
}

export function ResolutionPill({ value, onChange, className }: ResolutionPillProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-haspopup="listbox" className={`${PILL_BASE} ${PILL_WIDTH} ${className ?? ''}`}>
          <span className="flex-1 text-center text-foreground font-medium">{value}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40 bg-popover border-border">
        {(Object.keys(RESOLUTION_LABELS) as Resolution[]).map((opt) => {
          const active = opt === value;
          const { short, full } = RESOLUTION_LABELS[opt];
          return (
            <DropdownMenuItem
              key={opt}
              onClick={() => onChange(opt)}
              className={`font-mono text-sm gap-2 ${active ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
            >
              <span className="flex-1 flex flex-col">
                <span className={active ? 'text-foreground' : ''}>{short}</span>
                <span className="text-[10px] text-muted-foreground/60 normal-case tracking-normal">{full}</span>
              </span>
              {active && <span className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0 self-center" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
