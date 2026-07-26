import { useState } from 'react';
import { Phone, Lock, Globe, Check, ChevronDown } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { DARK_THEMES } from '@/components/ThemeLogo';
import { cn } from '@/lib/utils';
import { VoiceOrb, type OrbState } from '@/components/brand/VoiceOrb';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

export type NovaLeftStep = 'intro' | 'voice' | 'text';

interface NovaIntroPanelProps {
  step: NovaLeftStep;
  onSelectVoice: () => void;
  onSelectText: () => void;
}

const INTRO_LINE = "Hi, I'm Nova. Let's make FormaNova feel more tailored to your brand.";

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i++) d[i][0] = i;
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[rows - 1][cols - 1];
}

/**
 * cmdk's default filter only does in-order subsequence matching, so a single
 * typo ("spamish", "chienese") returns nothing on a short, finite language
 * list where typos are the norm. Blend substring matching with edit-distance
 * tolerance across each word of the label/keywords.
 */
function languageSearchFilter(value: string, search: string, keywords?: string[]): number {
  const query = search.trim().toLowerCase();
  if (!query) return 1;
  const terms = [value, ...(keywords ?? [])].map((t) => t.toLowerCase());
  let best = 0;
  for (const term of terms) {
    if (term.includes(query)) return 1;
    for (const word of term.split(/\s+/)) {
      if (!word) continue;
      const dist = levenshtein(word, query);
      const score = 1 - dist / Math.max(word.length, query.length);
      if (score > best) best = score;
    }
  }
  return best >= 0.55 ? best : 0;
}

interface NovaLanguageOption {
  code: string;
  label: string;
  /** English name(s), searchable even though the label is in-script. */
  englishName: string;
}

const NOVA_LANGUAGES: NovaLanguageOption[] = [
  { code: 'en', label: 'English', englishName: 'English' },
  { code: 'hi', label: 'हिन्दी', englishName: 'Hindi' },
  { code: 'ur', label: 'اردو', englishName: 'Urdu' },
  { code: 'ar', label: 'العربية', englishName: 'Arabic' },
  { code: 'es', label: 'Español', englishName: 'Spanish' },
  { code: 'fr', label: 'Français', englishName: 'French' },
  { code: 'de', label: 'Deutsch', englishName: 'German' },
  { code: 'pt', label: 'Português', englishName: 'Portuguese' },
  { code: 'zh', label: '中文', englishName: 'Chinese Mandarin' },
  { code: 'ja', label: '日本語', englishName: 'Japanese' },
  { code: 'ko', label: '한국어', englishName: 'Korean' },
  { code: 'ru', label: 'Русский', englishName: 'Russian' },
  { code: 'it', label: 'Italiano', englishName: 'Italian' },
  { code: 'tr', label: 'Türkçe', englishName: 'Turkish' },
  { code: 'bn', label: 'বাংলা', englishName: 'Bengali' },
  { code: 'id', label: 'Bahasa Indonesia', englishName: 'Indonesian' },
  { code: 'vi', label: 'Tiếng Việt', englishName: 'Vietnamese' },
  { code: 'nl', label: 'Nederlands', englishName: 'Dutch' },
];

export function NovaIntroPanel({ step, onSelectVoice }: NovaIntroPanelProps) {
  const { theme } = useTheme();
  const isDark = DARK_THEMES.has(theme);
  const [orbHovered, setOrbHovered] = useState(false);
  const [language, setLanguage] = useState('en');
  const [languageOpen, setLanguageOpen] = useState(false);

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

      {/* 4. Language selector — compact bordered control with search, secondary to the CTA */}
      {step === 'intro' && (
        <Popover open={languageOpen} onOpenChange={setLanguageOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Language"
              className="mt-6 flex h-11 w-64 items-center gap-2 border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:border-foreground/40"
            >
              <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-left">Language: {selectedLabel}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="center" className="w-64 border-border p-0">
            <Command filter={languageSearchFilter}>
              <CommandInput placeholder="Search language..." className="text-sm" />
              <CommandList>
                <CommandEmpty>No language found.</CommandEmpty>
                <CommandGroup>
                  {NOVA_LANGUAGES.map((l) => (
                    <CommandItem
                      key={l.code}
                      value={l.label}
                      keywords={[l.englishName]}
                      onSelect={() => {
                        setLanguage(l.code);
                        setLanguageOpen(false);
                      }}
                    >
                      <Check className={cn('mr-2 h-4 w-4', language === l.code ? 'opacity-100' : 'opacity-0')} />
                      {l.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
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
