import React from 'react';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
export const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '2:3', '3:2', '4:5', '5:4', '21:9'];

export type Resolution = '1K' | '2K' | '4K';

export const RESOLUTION_COSTS: Record<Resolution, number> = {
  '1K': 10,
  '2K': 15,
  '4K': 25,
};

const RESOLUTION_OPTIONS: Resolution[] = ['1K', '2K', '4K'];

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
      <DropdownMenuContent align="start" className="w-28 bg-popover border-border">
        {RESOLUTION_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt}
            onClick={() => onChange(opt)}
            className={`font-mono text-sm justify-between ${opt === value ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
          >
            {opt}
            {opt === value && <span className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
