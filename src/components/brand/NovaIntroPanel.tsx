import { useState } from 'react';
import { Lock, Mic, MicOff, PhoneOff, Pencil, Check, X, Plus } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { DARK_THEMES } from '@/components/ThemeLogo';
import { cn } from '@/lib/utils';
import { VoiceOrb, type VoiceOrbState } from '@/components/brand/VoiceOrb';
import { INSIGHT_META, type InsightFeedKey } from '@/components/brand/creative-zava-demo';

export type NovaOnboardingStep = 'intro' | 'speaking' | 'fields' | 'scanning' | 'done';

export const NOVA_INTRO_LINE =
  "Hi, I'm Nova. I'll learn about your brand so I can create a more bespoke FormaNova experience for you. To get started, please provide your brand name and website or store URL.";

const INPUT_CLASS =
  'w-full border border-border bg-background px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-foreground transition-colors';

export interface InsightFeedItem {
  key: InsightFeedKey;
  value: string;
}

interface NovaIntroPanelProps {
  step: NovaOnboardingStep;
  brandName: string;
  onBrandNameChange: (value: string) => void;
  website: string;
  onWebsiteChange: (value: string) => void;
  brandNameError?: boolean;
  onStartBuilding: () => void;
  onFinish: () => void;
  /** Seconds elapsed since the scanning "call" started. */
  callSeconds?: number;
  muted?: boolean;
  onToggleMute?: () => void;
  onEndCall?: () => void;
  insights?: InsightFeedItem[];
  onEditInsight?: (key: InsightFeedKey, value: string) => void;
  palette?: string[];
  onEditPalette?: (palette: string[]) => void;
  summaryLine?: string;
}

function formatCallTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function InsightRow({
  item,
  editable,
  onSave,
}: {
  item: InsightFeedItem;
  editable: boolean;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.value);
  const [saved, setSaved] = useState(false);
  const meta = INSIGHT_META[item.key];
  const Icon = meta.icon;

  const commit = () => {
    onSave(draft.trim());
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  return (
    <div className="border border-border bg-background/60 px-3.5 py-3 text-left">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {meta.label}
      </div>

      {editing ? (
        <div className="mt-2 flex items-start gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') { setDraft(item.value); setEditing(false); }
            }}
            className="w-full border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-foreground"
          />
          <button
            type="button"
            onClick={commit}
            aria-label="Save"
            className="flex h-8 w-8 shrink-0 items-center justify-center text-foreground hover:opacity-70"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => { setDraft(item.value); setEditing(false); }}
            aria-label="Cancel"
            className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground hover:opacity-70"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm text-foreground">{item.value}</p>
          {editable && (
            <button
              type="button"
              onClick={() => { setDraft(item.value); setEditing(true); }}
              aria-label={`Edit ${meta.label}`}
              className="flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            >
              {saved ? <Check className="h-3.5 w-3.5 text-formanova-success" /> : <Pencil className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PaletteRow({
  colors,
  editable,
  onSave,
}: {
  colors: string[];
  editable: boolean;
  onSave: (colors: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const meta = INSIGHT_META.palette;
  const Icon = meta.icon;

  const replaceAt = (i: number, hex: string) => onSave(colors.map((c, idx) => (idx === i ? hex : c)));
  const removeAt = (i: number) => onSave(colors.filter((_, idx) => idx !== i));
  const add = () => onSave([...colors, '#8A8A8A']);

  return (
    <div className="border border-border bg-background/60 px-3.5 py-3 text-left">
      <div className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        <span className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          {meta.label}
        </span>
        {editable && (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            aria-label={editing ? 'Done editing colors' : 'Edit color palette'}
            className="flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2.5">
        {colors.map((hex, i) => (
          <div key={`${hex}-${i}`} className="relative">
            <label
              className="block h-7 w-7 cursor-pointer rounded-full border border-border shadow-sm"
              style={{ backgroundColor: hex }}
            >
              <input
                type="color"
                value={hex}
                onChange={(e) => replaceAt(i, e.target.value)}
                className="sr-only"
                disabled={!editing}
              />
            </label>
            {editing && colors.length > 1 && (
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label="Remove color"
                className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-background"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        ))}
        {editing && (
          <button
            type="button"
            onClick={add}
            aria-label="Add color"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

const FEED_COLLAPSE_THRESHOLD = 5;
const FEED_VISIBLE_COUNT = 4;

export function NovaIntroPanel({
  step,
  brandName,
  onBrandNameChange,
  website,
  onWebsiteChange,
  brandNameError,
  onStartBuilding,
  onFinish,
  callSeconds = 0,
  muted = false,
  onToggleMute,
  onEndCall,
  insights = [],
  onEditInsight,
  palette = [],
  onEditPalette,
  summaryLine,
}: NovaIntroPanelProps) {
  const { theme } = useTheme();
  const isDark = DARK_THEMES.has(theme);
  const [showAllFindings, setShowAllFindings] = useState(false);

  let orbState: VoiceOrbState = 'idle';
  if (step === 'speaking') orbState = 'speaking';
  else if (step === 'scanning') orbState = 'connecting';
  else if (step === 'done') orbState = 'speaking';

  const ctaClass = cn(
    'flex w-full items-center justify-center gap-2.5 py-5 text-base font-medium transition-colors',
    isDark
      ? 'border border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-background'
      : 'bg-foreground text-background hover:opacity-90',
  );

  const editable = step === 'done';
  const isScreenScanning = step === 'scanning' || step === 'done';
  const hidden = insights.length > FEED_COLLAPSE_THRESHOLD && !showAllFindings
    ? insights.slice(0, insights.length - FEED_VISIBLE_COUNT)
    : [];
  const visible = insights.length > FEED_COLLAPSE_THRESHOLD && !showAllFindings
    ? insights.slice(insights.length - FEED_VISIBLE_COUNT)
    : insights;

  return (
    <div className="flex min-h-full flex-col items-center py-6 text-center">
      {/* 1. Animated Nova orb — always present */}
      <VoiceOrb state={orbState} size={isScreenScanning ? 128 : 224} />

      {/* Nova / AI Creative Consultant — omitted once the scanning screen starts, so
          the orb + timer + feed can own the space without repeated chrome. */}
      {!isScreenScanning && (
        <>
          <h2 className="mt-8 font-display text-5xl font-bold text-foreground sm:text-6xl">Nova</h2>
          <p className="mt-2 text-sm font-medium text-muted-foreground sm:text-base">AI Creative Consultant</p>
        </>
      )}

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

      {/* Scanning / done — call controls (scanning only) + progressive insight feed */}
      {isScreenScanning && (
        <div className="mt-6 w-full max-w-sm space-y-5 text-left">
          {step === 'scanning' && (
            <div className="flex items-center justify-center gap-4">
              <span data-testid="nova-call-timer" className="font-mono text-sm tabular-nums text-muted-foreground">
                {formatCallTime(callSeconds)}
              </span>
              <button
                type="button"
                onClick={onToggleMute}
                aria-label={muted ? 'Unmute' : 'Mute'}
                aria-pressed={muted}
                className="flex h-9 w-9 items-center justify-center border border-border text-foreground transition-colors hover:bg-foreground hover:text-background"
              >
                {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={onEndCall}
                aria-label="End call"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive text-destructive-foreground transition-opacity hover:opacity-90"
              >
                <PhoneOff className="h-4 w-4" />
              </button>
            </div>
          )}

          {step === 'done' && summaryLine && (
            <p data-testid="nova-summary-caption" className="animate-fade-in text-center text-sm italic leading-relaxed text-muted-foreground">
              {summaryLine}
            </p>
          )}

          {insights.length > 0 && (
            <div className="space-y-2.5">
              {hidden.length > 0 && !showAllFindings && (
                <button
                  type="button"
                  onClick={() => setShowAllFindings(true)}
                  className="w-full border border-dashed border-border py-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
                >
                  Show all findings ({insights.length})
                </button>
              )}
              {visible.map((item) =>
                item.key === 'palette' ? (
                  <PaletteRow
                    key="palette"
                    colors={palette}
                    editable={editable}
                    onSave={(colors) => onEditPalette?.(colors)}
                  />
                ) : (
                  <InsightRow
                    key={item.key}
                    item={item}
                    editable={editable}
                    onSave={(value) => onEditInsight?.(item.key, value)}
                  />
                ),
              )}
            </div>
          )}

          {step === 'done' && (
            <button type="button" onClick={onFinish} className={ctaClass}>
              Continue to FormaNova
            </button>
          )}
        </div>
      )}
    </div>
  );
}
