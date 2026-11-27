/**
 * Bulk Studio header: jewelry type, shoot type, default precision, + Add Jewelry.
 * Stateless — every value comes from BulkStudio.
 */
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { BULK_JEWELRY_TYPES, PrecisionDefault, ShootMode } from '@/lib/bulk-studio';


interface SegmentOption<T extends string> { value: T; label: string }

function Segmented<T extends string>({
  value, options, onChange, ariaLabel,
}: { value: T; options: SegmentOption<T>[]; onChange: (v: T) => void; ariaLabel: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex h-10 w-full lg:w-auto min-w-0 border border-formanova-hero-accent/40">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`flex-1 px-4 font-mono text-[10px] sm:text-xs tracking-[0.18em] uppercase font-bold whitespace-nowrap transition-colors duration-200 ${
              active
                ? 'bg-formanova-hero-accent text-primary-foreground'
                : 'bg-muted text-foreground/50 hover:text-foreground'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

interface BulkStudioHeaderProps {
  jewelryType: string;
  onJewelryTypeChange: (id: string) => void;
  mode: ShootMode;
  onModeChange: (m: ShootMode) => void;
  precision: PrecisionDefault;
  onPrecisionChange: (p: PrecisionDefault) => void;
  onAddJewelry: () => void;
}

export function BulkStudioHeader({
  jewelryType, onJewelryTypeChange, mode, onModeChange, precision, onPrecisionChange, onAddJewelry,
}: BulkStudioHeaderProps) {
  return (
    <header className="flex flex-col lg:flex-row lg:items-center gap-3 border-b border-border px-4 md:px-6 py-4">
      <Select value={jewelryType} onValueChange={onJewelryTypeChange}>
        <SelectTrigger aria-label="Jewelry type" className="h-10 w-full lg:w-40 font-mono text-xs uppercase tracking-wider">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BULK_JEWELRY_TYPES.map((t) => (
            <SelectItem key={t.id} value={t.id} className="font-mono text-xs uppercase tracking-wider">
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Segmented<ShootMode>
        ariaLabel="Shoot type"
        value={mode}
        onChange={onModeChange}
        options={[
          { value: 'model-shot', label: 'On-Model' },
          { value: 'product-shot', label: 'Product Shot' },
        ]}
      />

      <Segmented<PrecisionDefault>
        ariaLabel="Default precision"
        value={precision}
        onChange={onPrecisionChange}
        options={[
          { value: 'single', label: 'Single Angle' },
          { value: 'multi', label: 'Multi-Angle' },
        ]}
      />

      <Button
        onClick={onAddJewelry}
        className="h-10 w-full lg:w-auto px-6 lg:ml-auto font-display text-lg uppercase tracking-wide text-primary-foreground bg-gradient-to-r from-[hsl(var(--formanova-hero-accent))] to-[hsl(var(--formanova-glow))] hover:opacity-90"
      >
        <Plus className="h-4 w-4" />
        Add Jewelry
      </Button>
    </header>
  );
}
