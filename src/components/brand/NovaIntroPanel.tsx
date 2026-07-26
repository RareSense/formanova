import { Lock } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { DARK_THEMES } from '@/components/ThemeLogo';
import { cn } from '@/lib/utils';
import { VoiceOrb, type OrbState } from '@/components/brand/VoiceOrb';

export type NovaOnboardingStep = 'intro' | 'speaking' | 'fields' | 'building' | 'done';

export const NOVA_INTRO_LINE =
  "Hi, I'm Nova. I'll learn about your brand so I can create a more bespoke FormaNova experience for you. To get started, please provide your brand name and website or store URL.";

const INPUT_CLASS =
  'w-full border border-border bg-background px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-foreground transition-colors';

interface NovaIntroPanelProps {
  step: NovaOnboardingStep;
  brandName: string;
  onBrandNameChange: (value: string) => void;
  website: string;
  onWebsiteChange: (value: string) => void;
  brandNameError?: boolean;
  onStartBuilding: () => void;
  onFinish: () => void;
}

export function NovaIntroPanel({
  step,
  brandName,
  onBrandNameChange,
  website,
  onWebsiteChange,
  brandNameError,
  onStartBuilding,
  onFinish,
}: NovaIntroPanelProps) {
  const { theme } = useTheme();
  const isDark = DARK_THEMES.has(theme);

  let orbState: OrbState = 'idle';
  if (step === 'speaking') orbState = 'speaking';
  else if (step === 'building') orbState = 'connecting';

  const ctaClass = cn(
    'flex w-full items-center justify-center gap-2.5 py-5 text-base font-medium transition-colors',
    isDark
      ? 'border border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-background'
      : 'bg-foreground text-background hover:opacity-90',
  );

  return (
    <div className="flex min-h-full flex-col items-center justify-center py-6 text-center">
      {/* 1. Animated Nova orb */}
      <VoiceOrb state={orbState} />

      {/* 2. Nova */}
      <h2 className="mt-8 font-display text-5xl font-bold text-foreground sm:text-6xl">Nova</h2>

      {/* 3. AI Creative Consultant */}
      <p className="mt-2 text-sm font-medium text-muted-foreground sm:text-base">AI Creative Consultant</p>

      {/* Simulated speech — no chat bubble, just Nova "talking" */}
      {step === 'speaking' && (
        <p
          data-testid="nova-speaking-caption"
          className="mt-8 max-w-md animate-fade-in text-base italic leading-relaxed text-muted-foreground"
        >
          {NOVA_INTRO_LINE}
        </p>
      )}

      {/* Brand name + website/store URL, revealed once the intro finishes */}
      {step === 'fields' && (
        <div className="mt-8 w-full max-w-sm animate-fade-in space-y-4 text-left">
          <div className="space-y-2">
            <label htmlFor="nova-brand-name" className="text-sm font-medium text-foreground">
              Brand name
            </label>
            <input
              id="nova-brand-name"
              type="text"
              value={brandName}
              onChange={(e) => onBrandNameChange(e.target.value)}
              maxLength={120}
              placeholder="Enter your brand or business name"
              className={cn(INPUT_CLASS, brandNameError && 'border-destructive focus:border-destructive')}
            />
            {brandNameError && <p className="text-xs text-destructive">Brand name is required.</p>}
          </div>

          <div className="space-y-2">
            <label htmlFor="nova-website" className="text-sm font-medium text-foreground">
              Website or store URL
            </label>
            <input
              id="nova-website"
              type="text"
              value={website}
              onChange={(e) => onWebsiteChange(e.target.value)}
              maxLength={200}
              placeholder="yourbrand.com"
              className={INPUT_CLASS}
            />
          </div>

          <button type="button" onClick={onStartBuilding} className={ctaClass}>
            Continue
          </button>

          <p className="flex items-center justify-center gap-1.5 pt-1 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            Your information stays private.
          </p>
        </div>
      )}

      {step === 'building' && (
        <p
          data-testid="nova-building-caption"
          className="mt-8 max-w-sm animate-fade-in text-base italic leading-relaxed text-muted-foreground"
        >
          Building your bespoke FormaNova card…
        </p>
      )}

      {step === 'done' && (
        <div className="mt-8 w-full max-w-sm animate-fade-in space-y-5">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your bespoke card is ready. You can always refine these details later.
          </p>
          <button type="button" onClick={onFinish} className={ctaClass}>
            Continue to FormaNova
          </button>
        </div>
      )}
    </div>
  );
}
