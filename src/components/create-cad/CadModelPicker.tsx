import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CAD_MODEL_GROUPS, cadModelLabel } from "@/lib/cad-model-options";
import type { RingCadTier } from "@/lib/ring-cad-nurbs-api";

interface CadModelPickerProps {
  value: RingCadTier;
  onChange: (tier: RingCadTier) => void;
  disabled?: boolean;
}

/**
 * Admin-only: which model writes the CAD, grouped by how it is paid for
 * (Direct API, OpenRouter, Subscription). Customers never see it and keep the
 * default tier.
 */
export default function CadModelPicker({ value, onChange, disabled }: CadModelPickerProps) {
  return (
    <div className="flex flex-col gap-1 sm:min-w-[240px]">
      <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Model · admin</span>
      <Select value={value} onValueChange={(tier) => onChange(tier as RingCadTier)} disabled={disabled}>
        <SelectTrigger aria-label="Model (admin only)" className="h-12 rounded-none border-border bg-background text-sm">
          <SelectValue>{cadModelLabel(value)}</SelectValue>
        </SelectTrigger>
        {/* Above the design editor window (z-[121]), which this also opens inside. */}
        <SelectContent className="z-[200] rounded-none">
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
