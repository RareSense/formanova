import { Plus, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FieldLabel } from '@/components/brand/JewelryBrandFormFields';

interface Platform {
  key: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}

interface Props {
  visiblePlatforms: Platform[];
  handles: Record<string, string>;
  error?: string;
  extraLink: string;
  extraError?: string;
  revealed: string[];
  nextReveal?: string;
  onHandleChange: (key: string, value: string) => void;
  onRemoveHandle: (key: string) => void;
  onExtraChange: (value: string) => void;
  onRemoveExtra: () => void;
  onReveal: (key: string) => void;
  onFocus: () => void;
}

export function SocialProfilesSection({
  visiblePlatforms,
  handles,
  error,
  extraLink,
  extraError,
  revealed,
  nextReveal,
  onHandleChange,
  onRemoveHandle,
  onExtraChange,
  onRemoveExtra,
  onReveal,
  onFocus,
}: Props) {
  return (
    <div className="space-y-2">
      <FieldLabel label="Social profiles" />
      <div className="space-y-2">
        {visiblePlatforms.map(({ key, label, Icon }) => (
          <div
            key={key}
            className={cn(
              'flex items-center border border-border bg-background focus-within:border-foreground transition-colors',
              error && 'border-destructive focus-within:border-destructive',
            )}
          >
            <span className="flex w-24 shrink-0 items-center gap-2 border-r border-border px-2.5 py-3.5 text-foreground sm:w-32 sm:gap-2.5 sm:px-3.5">
              <Icon className="h-4 w-4 shrink-0" />
              <span className="text-sm">{label}</span>
            </span>
            <span className="pl-3 text-sm text-muted-foreground" aria-hidden="true">@</span>
            <input
              type="text"
              value={handles[key] ?? ''}
              onChange={(e) => onHandleChange(key, e.target.value)}
              onFocus={onFocus}
              maxLength={40}
              placeholder="yourbrand"
              aria-label={`${label} handle`}
              className="min-w-0 flex-1 bg-transparent py-3.5 pl-1 pr-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
            />
            {(handles[key] ?? '').trim() && (
              <Check className="mx-3 h-4 w-4 shrink-0 text-formanova-success" aria-label="Filled" />
            )}
            {(key !== 'instagram' || (handles[key] ?? '').trim()) && (
              <button
                type="button"
                onClick={() => onRemoveHandle(key)}
                className="mr-2 shrink-0 p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                aria-label={key === 'instagram' ? 'Clear Instagram' : `Remove ${label}`}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {revealed.includes('extra') && (
          <div className="space-y-1.5">
            <div className="flex items-center border border-border bg-background focus-within:border-foreground transition-colors">
              <input
                type="url"
                value={extraLink}
                onChange={(e) => onExtraChange(e.target.value)}
                onFocus={onFocus}
                maxLength={200}
                placeholder="Any other profile URL"
                className="min-w-0 flex-1 bg-transparent px-3.5 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
              />
              {extraLink.trim() && (
                <Check className="mx-3 h-4 w-4 shrink-0 text-formanova-success" aria-label="Filled" />
              )}
              <button
                type="button"
                onClick={onRemoveExtra}
                className="mr-2 shrink-0 p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                aria-label="Remove link"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {extraError && <p className="text-xs text-destructive">{extraError}</p>}
          </div>
        )}
        {nextReveal && (
          <button
            type="button"
            onClick={() => onReveal(nextReveal)}
            className="flex items-center gap-1 pt-0.5 text-sm font-medium text-foreground hover:opacity-70 transition-opacity"
          >
            <Plus className="h-3.5 w-3.5" />
            Add more
          </button>
        )}
      </div>
    </div>
  );
}
