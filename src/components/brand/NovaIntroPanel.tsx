import { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { DARK_THEMES } from '@/components/ThemeLogo';
import { cn } from '@/lib/utils';
import { VoiceOrb, type OrbState } from '@/components/brand/VoiceOrb';

export type NovaLeftStep = 'intro' | 'voice' | 'text';

interface NovaIntroPanelProps {
  step: NovaLeftStep;
  onSelectVoice: () => void;
  onSelectText: () => void;
}

const INTRO_LINE = "Hi, I'm Nova. Let's make FormaNova feel more tailored to your brand.";

export function NovaIntroPanel({ step, onSelectVoice, onSelectText }: NovaIntroPanelProps) {
  const { theme } = useTheme();
  const isDark = DARK_THEMES.has(theme);
  const [orbHovered, setOrbHovered] = useState(false);

  let orbState: OrbState = 'idle';
  if (step === 'voice') orbState = 'speaking';
  else if (step === 'text') orbState = 'listening';
  else if (orbHovered) orbState = 'hover';

  return (
    <div className="flex min-h-full flex-col items-center justify-center py-4 text-center">
      <p className="font-card text-xs uppercase tracking-[0.3em] text-muted-foreground">
        Meet Nova
      </p>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground sm:text-base">
        Your creative consultant for a more tailored FormaNova experience.
      </p>

      <div
        className="mt-8"
        onMouseEnter={() => setOrbHovered(true)}
        onMouseLeave={() => setOrbHovered(false)}
      >
        <VoiceOrb state={orbState} />
      </div>

      <h2 className="mt-6 font-display text-3xl text-foreground sm:text-4xl">Nova</h2>
      <p className="mt-1 text-sm font-medium text-muted-foreground">Creative Consultant</p>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground sm:text-base">
        Let's make FormaNova feel more tailored to your brand.
      </p>

      {step === 'intro' && (
        <div className="mt-8 flex w-full max-w-xs flex-col items-center gap-4">
          <button
            type="button"
            onClick={onSelectVoice}
            className={cn(
              'w-full py-4 text-sm font-medium transition-colors',
              isDark
                ? 'border border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-background'
                : 'bg-foreground text-background hover:opacity-90',
            )}
          >
            Talk to Nova
          </button>
          <button
            type="button"
            onClick={onSelectText}
            className="text-sm font-medium text-foreground underline-offset-4 transition-opacity hover:opacity-70"
          >
            Continue without voice
          </button>
        </div>
      )}

      {step === 'voice' && (
        <p
          data-testid="nova-voice-caption"
          className="mt-8 max-w-sm animate-fade-in text-sm italic leading-relaxed text-muted-foreground"
        >
          {INTRO_LINE}
        </p>
      )}

      {step === 'text' && (
        <div
          data-testid="nova-text-message"
          className="mt-8 w-full max-w-sm animate-fade-in border border-border bg-background px-4 py-3 text-left text-sm leading-relaxed text-foreground"
        >
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Nova
          </p>
          {INTRO_LINE}
        </div>
      )}
    </div>
  );
}
