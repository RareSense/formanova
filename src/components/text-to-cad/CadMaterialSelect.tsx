import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CAD_MATERIAL_PROFILES, type CadMaterialProfile } from '@/lib/ring-cad-nurbs-api';

interface CadMaterialSelectProps {
  value: CadMaterialProfile | null;
  onChange: (value: CadMaterialProfile | null) => void;
  disabled?: boolean;
}

export default function CadMaterialSelect({ value, onChange, disabled }: CadMaterialSelectProps) {
  return (
    <Select
      value={value?.id ?? 'none'}
      onValueChange={(id) => onChange(CAD_MATERIAL_PROFILES.find(profile => profile.id === id) ?? null)}
      disabled={disabled}
    >
      <SelectTrigger className="h-11 w-full px-4 font-mono text-[12px] uppercase tracking-[0.12em] sm:w-[210px]" aria-label="Metal alloy">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none" className="font-mono text-[12px] uppercase tracking-[0.12em]">Metal not specified</SelectItem>
        {CAD_MATERIAL_PROFILES.map(profile => (
          <SelectItem key={profile.id} value={profile.id} className="font-mono text-[12px] uppercase tracking-[0.12em]">
            {profile.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
