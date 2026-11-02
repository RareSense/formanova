/**
 * The metal picker: a native select grouped by family. Native on purpose: the
 * keyboard, screen readers and the phone's own picker all work without extra
 * code, and only alloys with a cited density can appear in it.
 */
import { ALLOY_GROUPS } from '@/lib/metal-weight/alloys';
import { cn } from '@/lib/utils';

export interface MetalSelectProps {
  value: string | null;
  onChange: (id: string | null) => void;
  /** The accessible name, also used when no visible label points at `id`. */
  label: string;
  id?: string;
  /** Adds a first, empty option (e.g. "Not set") that maps to null. */
  noneLabel?: string;
  disabled?: boolean;
  className?: string;
}

export function MetalSelect({ value, onChange, label, id, noneLabel, disabled, className }: MetalSelectProps) {
  return (
    <select
      id={id}
      aria-label={label}
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
      className={cn(
        'h-8 min-w-0 max-w-full truncate border border-border bg-background px-2 font-mono text-[11px] text-foreground',
        'focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60',
        className,
      )}
    >
      {noneLabel && <option value="">{noneLabel}</option>}
      {ALLOY_GROUPS.map((group) => (
        <optgroup key={group.family} label={group.label}>
          {group.alloys.map((alloy) => (
            <option key={alloy.id} value={alloy.id}>{alloy.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export default MetalSelect;
