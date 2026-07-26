import { useState } from 'react';
import { Phone, Lock, Globe } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { DARK_THEMES } from '@/components/ThemeLogo';
import { cn } from '@/lib/utils';
import { VoiceOrb, type OrbState } from '@/components/brand/VoiceOrb';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type NovaLeftStep = 'intro' | 'voice' | 'text';

interface NovaIntroPanelProps {
  step: NovaLeftStep;
  onSelectVoice: () => void;
  onSelectText: () => void;
}

const INTRO_LINE = "Hi, I'm Nova. Let's make FormaNova feel more tailored to your brand.";

interface NovaLanguageOption {
  code: string;
  label: string;
}

const NOVA_LANGUAGES: NovaLanguageOption[] = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ur', label: 'اردو' },
  { code: 'ar', label: 'العربية' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'ru', label: 'Русский' },
  { code: 'it', label: 'Italiano' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'bn', label: 'বাংলা' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'nl', label: 'Nederlands' },
];

export function NovaIntroPanel({ step, onSelectVoice }: NovaIntroPanelProps) {
  const { theme } = useTheme();
  const isDark = DARK_THEMES.has(theme);
  const [orbHovered, setOrbHovered] = useState(false);
  const [language, setLanguage] = useState('en');

  const selectedLabel = NOVA_LANGUAGES.find((l) => l.code === language)?.label ?? 'English';

  let orbState: OrbState = 'idle';
  if (step === 'voice') orbState = 'speaking';
  else if (step === 'text') orbState = 'listening';
  else if (orbHovered) orbState = 'hover';

  return (
    <div className="flex min-h-full flex-col items-center justify-center py-6 text-center">
      {/* 1. Animated Nova orb */}
      <div
        onMouseEnter={() => setOrbHovered(true)}
        onMouseLeave={() => setOrbHovered(false)}
      >
        <VoiceOrb state={orbState} />
      </div>

      {/* 2. Nova */}
      <h2 className="mt-8 font-display text-5xl font-bold text-foreground sm:text-6xl">Nova</h2>

      {/* 3. Your creative consultant */}
      <p className="mt-2 text-sm font-medium text-muted-foreground sm:text-base">Your creative consultant</p>

      {/* 4. Language selector — compact bordered control, secondary to the CTA */}
      {step === 'intro' && (
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger
            aria-label="Language"
            className="mt-6 h-11 w-60 gap-2 border border-border bg-background px-4 text-sm font-medium text-foreground shadow-none focus:ring-0 focus:ring-offset-0"
          >
            <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
            <SelectValue>
              <span>Language: {selectedLabel}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="center">
            {NOVA_LANGUAGES.map((l) => (
              <SelectItem key={l.code} value={l.code}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* 5. Short supporting copy */}
      {step === 'intro' && (
        <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
          Let's get to know your brand and shape a more tailored FormaNova experience.
        </p>
      )}

      {step === 'intro' && (
        <div className="mt-9 flex w-full flex-col items-center gap-4">
          {/* 6. Talk to Nova — call action, not page navigation */}
          <button
            type="button"
            onClick={onSelectVoice}
            className={cn(
              'flex w-[340px] max-w-full items-center justify-center gap-2.5 py-5 text-base font-medium transition-colors',
              isDark
                ? 'border border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-background'
                : 'bg-foreground text-background hover:opacity-90',
            )}
          >
            <Phone className="h-5 w-5 shrink-0" />
            Talk to Nova
          </button>

          {/* 7. Privacy note */}
          <p className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground sm:text-sm">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            Your information stays private.
          </p>
        </div>
      )}

      {step === 'voice' && (
        <p
          data-testid="nova-voice-caption"
          className="mt-9 max-w-md animate-fade-in text-base italic leading-relaxed text-muted-foreground"
        >
          {INTRO_LINE}
        </p>
      )}

      {step === 'text' && (
        <div
          data-testid="nova-text-message"
          className="mt-9 w-full max-w-md animate-fade-in border border-border bg-background px-4 py-3 text-left text-sm leading-relaxed text-foreground"
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
