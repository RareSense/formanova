import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CAD_MODEL_GROUPS, cadModelLabel } from '@/lib/cad-model-options';
import type { RingCadTier } from '@/lib/ring-cad-nurbs-api';

const KNOWN_TIERS = new Set<string>(CAD_MODEL_GROUPS.flatMap((group) => group.options.map((o) => o.tier)));

function isKnownCadTier(value: string): value is RingCadTier {
  return KNOWN_TIERS.has(value);
}

interface CadTierSelectProps {
  /** Shown above the select, and its accessible name. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Options before the model list, such as "Default" (value is a sentinel, never a tier). */
  leading?: Array<{ value: string; label: string }>;
  disabled?: boolean;
}

/**
 * Admin-only: pick the AI for a CAD step, from the same grouped list as the
 * generate page's model picker. A value we don't know is listed under its raw
 * name, so it is never silently replaced.
 */
export default function CadTierSelect({ label, value, onChange, leading = [], disabled }: CadTierSelectProps) {
  const lead = leading.find((option) => option.value === value);
  const unknown = !lead && !isKnownCadTier(value) ? value : null;
  const shown = lead ? lead.label : isKnownCadTier(value) ? cadModelLabel(value) : value;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger aria-label={label} className="h-10 w-full rounded-none border-border bg-background text-sm">
          <SelectValue>{shown}</SelectValue>
        </SelectTrigger>
        <SelectContent className="rounded-none">
          {(leading.length > 0 || unknown) && (
            <SelectGroup>
              {leading.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
              {unknown && <SelectItem value={unknown}>{unknown}</SelectItem>}
            </SelectGroup>
          )}
          {CAD_MODEL_GROUPS.map((group) => (
            <SelectGroup key={group.route}>
              <SelectLabel className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{group.label}</SelectLabel>
              {group.options.map((option) => (
                <SelectItem key={option.tier} value={option.tier}>{option.name}</SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
