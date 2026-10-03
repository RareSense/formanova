/**
 * Admin-only choice of the LLM a CAD run uses: model, then whether it is
 * reached directly or through OpenRouter. Shared by the Text to CAD and Image
 * to CAD prompt screens; the page decides whether to show it.
 *
 * Both rows use the same four-column grid, so every button is the same size
 * and the two provider buttons line up under the first two models.
 */

import { Button } from '@/components/ui/button';
import {
  CAD_PICKER_MODELS,
  CAD_PICKER_PROVIDERS,
  type CadModelPick,
} from '@/lib/cad-model-picker';

interface CadModelPickerProps {
  value: CadModelPick;
  onChange: (value: CadModelPick) => void;
  disabled?: boolean;
}

const LABEL = 'font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground';
const OPTION = 'h-10 w-full px-4 font-mono text-[12px] uppercase tracking-[0.1em]';

export default function CadModelPicker({ value, onChange, disabled }: CadModelPickerProps) {
  return (
    <div className="flex w-full flex-col gap-3" data-testid="cad-model-picker">
      <div className="flex flex-col gap-2">
        <span className={LABEL}>Model (admin)</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CAD_PICKER_MODELS.map((m) => {
            const selected = m.id === value.model;
            return (
              <Button
                key={m.id}
                type="button"
                variant={selected ? 'default' : 'outline'}
                aria-pressed={selected}
                disabled={disabled}
                className={OPTION}
                onClick={() => onChange({ ...value, model: m.id })}
              >
                {m.label}
              </Button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className={LABEL}>Provider</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CAD_PICKER_PROVIDERS.map((p) => {
            const selected = p.id === value.provider;
            return (
              <Button
                key={p.id}
                type="button"
                variant={selected ? 'default' : 'outline'}
                aria-pressed={selected}
                disabled={disabled}
                className={OPTION}
                onClick={() => onChange({ ...value, provider: p.id })}
              >
                {p.label}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
