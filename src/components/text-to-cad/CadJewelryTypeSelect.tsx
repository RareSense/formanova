/**
 * Picks which product a CAD run builds. Shared by the Text to CAD and Image to
 * CAD prompt screens, where it sits beside Generate at the same height so the
 * two controls read as one action row.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CAD_JEWELRY_TYPES, type CadJewelryType } from '@/lib/ring-cad-nurbs-api';

interface CadJewelryTypeSelectProps {
  value: CadJewelryType;
  onChange: (value: CadJewelryType) => void;
  disabled?: boolean;
}

export default function CadJewelryTypeSelect({ value, onChange, disabled }: CadJewelryTypeSelectProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as CadJewelryType)} disabled={disabled}>
      <SelectTrigger
        className="h-11 w-full px-4 font-mono text-[12px] uppercase tracking-[0.15em] sm:w-[180px]"
        aria-label="Jewelry type"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CAD_JEWELRY_TYPES.map((t) => (
          <SelectItem key={t.value} value={t.value} className="font-mono text-[12px] uppercase tracking-[0.15em]">
            {t.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
