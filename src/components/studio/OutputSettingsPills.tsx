import React from 'react';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import creditCoinIcon from '@/assets/icons/credit-coin.png';

export const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '2:3', '3:2', '4:5', '5:4', '21:9'];

export type Resolution = '1K' | '2K' | '4K';

export const RESOLUTION_COSTS: Record<Resolution, number> = {
  '1K': 10,
  '2K': 15,
  '4K': 25,
};

const RESOLUTION_OPTIONS: { value: Resolution; label: string; delta: number | null }[] = [
  { value: '1K', label: '1K', delta: null },
  { value: '2K', label: '2K', delta: 5 },
  { value: '4K', label: '4K', delta: 15 },
];

const PILL_BASE =
  'h-11 flex items-center gap-1.5 px-3 rounded-md border border-primary/60 bg-background ' +
  'hover:border-primary transition-colors font-mono text-sm ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-w-[44px]';

interface AspectRatioPillProps {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

export function AspectRatioPill({ value, onChange, className }: AspectRatioPillProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-haspopup="listbox" className={`${PILL_BASE} ${className ?? ''}`}>
          <span className="text-muted-foreground text-[11px] uppercase tracking-widest hidden xl:inline whitespace-nowrap">
            Frame
          </span>
          <span className="text-foreground font-medium whitespace-nowrap">{value}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-36 max-h-60 overflow-y-auto bg-popover border-border">
        {ASPECT_RATIOS.map((ratio) => (
          <DropdownMenuItem
            key={ratio}
            onClick={() => onChange(ratio)}
            className={`font-mono text-sm justify-between ${ratio === value ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
          >
            {ratio}
            {ratio === value && <span className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />}
          </DropdownMenuItem>
        ))}
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
        <button type="button" aria-haspopup="listbox" className={`${PILL_BASE} ${className ?? ''}`}>
          <span className="text-muted-foreground text-[11px] uppercase tracking-widest hidden xl:inline whitespace-nowrap">
            Res
          </span>
          <span className="text-foreground font-medium">{value}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44 bg-popover border-border">
        {RESOLUTION_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`font-mono text-sm ${opt.value === value ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
          >
            <div className="grid grid-cols-[1fr_auto] w-full items-center gap-3">
              <span>{opt.label}</span>
              {opt.delta !== null ? (
                <span className="text-[10px] text-muted-foreground/70">+{opt.delta} cr</span>
              ) : (
                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/60">
                  <img src={creditCoinIcon} alt="" className="h-3 w-3 object-contain" />
                  {RESOLUTION_COSTS[opt.value]}
                </span>
              )}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
