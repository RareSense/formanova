import { useState } from 'react';
import { AlertCircle, Check, Lock, MessageCircle, Mic, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { DARK_THEMES } from '@/components/ThemeLogo';
import { cn } from '@/lib/utils';
import { VoiceOrb, type VoiceOrbState } from '@/components/brand/VoiceOrb';
import { INSIGHT_META, type InsightFeedKey } from '@/components/brand/brand-insight-meta';
import { BrandFindingRow } from '@/components/brand/BrandFindingRow';
import { MissingBrandDetails, type MissingBrandDetailsProps } from '@/components/brand/MissingBrandDetails';
import { BrandScanProgressPanel } from '@/components/brand/BrandScanProgressPanel';
import {
  EMPTY_BRAND_SCAN_PROGRESS,
  type BrandScanProgress,
} from '@/lib/brand-scan-api';

export type NovaOnboardingStep = 'intro' | 'fields' | 'scanning' | 'non_storefront' | 'done' | 'next';

export const NOVA_INTRO_LINE =
  "Hi, I'm Nova. I'll learn about your brand so I can create a more bespoke FormaNova experience for you.";

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
  websiteError?: string | null;
  scanError?: string | null;
  scanStatus?: string;
  scanProgress?: BrandScanProgress;
  scanNotice?: string | null;
  onSelectMessage: () => void;
  onStartBuilding: () => void;
  onRetryStorefront: () => void;
  onManualSetup: () => void;
  onRescan?: () => void;
  onConfirm: () => void;
  onAddMore?: () => void;
  onFinish: () => void;
  insights?: InsightFeedItem[];
  onEditInsight?: (key: InsightFeedKey, value: string) => void;
  palette?: string[];
  onEditPalette?: (palette: string[]) => void;
  summaryLine?: string;
  missingDetails?: MissingBrandDetailsProps;
}

function InsightRow({
  item,
  editable,
  onSave,
  accent,
  isDark,
}: {
  item: InsightFeedItem;
  editable: boolean;
  onSave: (value: string) => void;
  accent?: string;
  isDark: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.value);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const meta = INSIGHT_META[item.key];
  /** Past this, a finding is an appendix rather than a headline. */
  const isLong = item.value.length > 220;

  const commit = () => {
    onSave(draft.trim());
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  if (editing) {
    return (
      <BrandFindingRow finding={item.key} accent={accent} isDark={isDark}>
        <div className="mt-2 flex items-start gap-2">
          <textarea
            autoFocus
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit();
              if (e.key === 'Escape') { setDraft(item.value); setEditing(false); }
            }}
            className="min-h-20 w-full resize-y border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-foreground"
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
      </BrandFindingRow>
    );
  }

  return (
    <BrandFindingRow
      finding={item.key}
      accent={accent}
      isDark={isDark}
      trailing={editable && (
        <button
          type="button"
          onClick={() => { setDraft(item.value); setEditing(true); }}
          aria-label={`Edit ${meta.label}`}
          className="flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          {saved ? <Check className="h-3.5 w-3.5 text-formanova-success" /> : <Pencil className="h-3.5 w-3.5" />}
        </button>
      )}
    >
      <p
        className={cn(
          'mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground',
          isLong && !expanded && 'line-clamp-2',
        )}
      >
        {item.value}
      </p>
      {/* Long appendix findings (the scanner's "other details" dump) would
          otherwise swallow the panel. Collapsed by default, never lost. */}
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs font-medium text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </BrandFindingRow>
  );
}

function PaletteRow({
  colors,
  editable,
  onSave,
  accent,
  isDark,
}: {
  colors: string[];
  editable: boolean;
  onSave: (colors: string[]) => void;
  accent?: string;
  isDark: boolean;
}) {
  const [editing, setEditing] = useState(false);

  const replaceAt = (i: number, hex: string) => onSave(colors.map((c, idx) => (idx === i ? hex : c)));
  const removeAt = (i: number) => onSave(colors.filter((_, idx) => idx !== i));
  const add = () => onSave([...colors, '#8A8A8A']);

  return (
    <BrandFindingRow
      finding="palette"
      accent={accent}
      isDark={isDark}
      trailing={editable && (
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          aria-label={editing ? 'Done editing colors' : 'Edit color palette'}
          className="flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
        </button>
      )}
    >
      <div className="mt-2 flex flex-wrap items-center gap-2.5">
        {colors.map((hex, i) => (
          <div key={`${hex}-${i}`} className="relative flex items-center gap-1.5">
            <label
              className="block h-7 w-7 cursor-pointer border border-border shadow-sm"
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
            <span className="font-mono text-[10px] uppercase text-muted-foreground">{hex}</span>
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
            className="flex h-7 w-7 items-center justify-center border border-dashed border-border text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </BrandFindingRow>
  );
}

export function NovaIntroPanel({
  step,
  brandName,
  onBrandNameChange,
  website,
  onWebsiteChange,
  brandNameError,
  websiteError,
  scanError,
  scanStatus = 'Scanning your storefront…',
  scanProgress = EMPTY_BRAND_SCAN_PROGRESS,
  scanNotice,
  onSelectMessage,
  onStartBuilding,
  onRetryStorefront,
  onManualSetup,
  onRescan,
  onConfirm,
  onAddMore,
  onFinish,
  insights = [],
  onEditInsight,
  palette = [],
  onEditPalette,
  summaryLine,
  missingDetails,
}: NovaIntroPanelProps) {
  const { theme } = useTheme();
  const isDark = DARK_THEMES.has(theme);

  let orbState: VoiceOrbState = 'idle';
  if (step === 'scanning') orbState = 'connecting';
  else if (step === 'done') orbState = 'speaking';

  const ctaClass = cn(
    'flex w-full items-center justify-center gap-2.5 py-5 text-base font-medium transition-colors',
    isDark
      ? 'border border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-background'
      : 'bg-foreground text-background hover:opacity-90',
  );

  const editable = step === 'done';
  const isDiscoveryScreen = step === 'scanning' || step === 'non_storefront' || step === 'done';

  return (
    <div className="flex min-h-full flex-col items-center py-6 text-center">
      {/* 1. Animated Nova orb — always present */}
      <VoiceOrb state={orbState} size={isDiscoveryScreen ? 128 : 224} />

      {/* Nova / AI Creative Consultant — omitted once the scanning screen starts, so
          the orb + timer + feed can own the space without repeated chrome. */}
      {!isDiscoveryScreen && step !== 'next' && (
        <>
          <h2 className="mt-8 font-display text-5xl font-bold text-foreground sm:text-6xl">Nova</h2>
          <p className="mt-2 text-sm font-medium text-muted-foreground sm:text-base">AI Creative Consultant</p>
        </>
      )}

      {/* Entry choice. Voice remains disabled until a real service is connected. */}
      {step === 'intro' && (
        <div className="mt-8 w-full max-w-sm space-y-3 animate-fade-in">
          <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{NOVA_INTRO_LINE}</p>
          <button type="button" disabled className={cn(ctaClass, 'cursor-not-allowed opacity-55')}>
            <Mic className="h-4 w-4" />
            Talk to Nova <span className="text-xs font-normal">(coming soon)</span>
          </button>
          <button type="button" onClick={onSelectMessage} className="flex w-full items-center justify-center gap-2.5 border border-border py-4 text-sm font-medium text-foreground transition-colors hover:border-foreground">
            <MessageCircle className="h-4 w-4" />
            Message Nova
          </button>
          <p className="pt-2 text-xs leading-relaxed text-muted-foreground">
            Your brand information is used only to personalise FormaNova. It is not sold, published, or used to train AI models.
          </p>
        </div>
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
              Online store URL
            </label>
            <input
              id="nova-website"
              type="text"
              value={website}
              onChange={(e) => onWebsiteChange(e.target.value)}
              maxLength={200}
              placeholder="yourbrand.com"
              className={cn(INPUT_CLASS, websiteError && 'border-destructive focus:border-destructive')}
            />
            {websiteError && <p className="text-xs text-destructive">{websiteError}</p>}
          </div>

          <button type="button" onClick={onStartBuilding} className={ctaClass}>
            Start brand scan
          </button>

          {scanError && (
            <p role="alert" className="flex items-start gap-2 border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {scanError}
            </p>
          )}

          <p className="flex items-center justify-center gap-1.5 pt-1 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            Your information stays private.
          </p>
        </div>
      )}

      {/* Real workflow progress followed by editable terminal findings. */}
      {isDiscoveryScreen && (
        <div className="mt-6 w-full max-w-sm space-y-5 text-left">
          {step === 'scanning' && (
            <BrandScanProgressPanel progress={scanProgress} fallbackStatus={scanStatus} />
          )}

          {step === 'non_storefront' && (
            <div className="space-y-4 border border-border p-5 text-center animate-fade-in">
              <AlertCircle className="mx-auto h-6 w-6 text-muted-foreground" />
              <div className="space-y-2">
                <h3 className="font-display text-2xl font-bold text-foreground">We couldn’t find an online store</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Check that you entered your public shop address, or continue by adding your brand details manually.
                </p>
              </div>
              <button type="button" onClick={onRetryStorefront} className={ctaClass}>
                Try another URL
              </button>
              <button
                type="button"
                onClick={onManualSetup}
                className="w-full border border-border py-3 text-sm font-medium text-foreground hover:border-foreground"
              >
                Set up manually
              </button>
            </div>
          )}

          {step === 'done' && summaryLine && (
            <p data-testid="nova-summary-caption" className="animate-fade-in text-center text-sm italic leading-relaxed text-muted-foreground">
              {summaryLine}
            </p>
          )}

          {step === 'done' && scanNotice && (
            <p data-testid="scan-result-notice" role="status" className="border border-border bg-muted/30 p-3 text-sm leading-relaxed text-muted-foreground">
              {scanNotice}
            </p>
          )}

          {/* While scanning, the live feed above is the single source for
              findings. Rendering the editable list too showed the palette
              (and every other finding) twice on the same screen. */}
          {step !== 'scanning' && insights.length > 0 && (
            <div className="space-y-2.5">
              {insights.map((item) =>
                item.key === 'palette' ? (
                  <PaletteRow
                    key="palette"
                    colors={palette}
                    editable={editable}
                    accent={palette[0]}
                    isDark={isDark}
                    onSave={(colors) => onEditPalette?.(colors)}
                  />
                ) : (
                  <InsightRow
                    key={item.key}
                    item={item}
                    editable={editable}
                    accent={palette[0]}
                    isDark={isDark}
                    onSave={(value) => onEditInsight?.(item.key, value)}
                  />
                ),
              )}
            </div>
          )}

          {step === 'done' && (
            <div className="space-y-3">
              {missingDetails && <MissingBrandDetails {...missingDetails} />}
              <button type="button" onClick={onConfirm} className={ctaClass}>
                Looks perfect
              </button>
              <button type="button" onClick={onAddMore} className="flex w-full items-center justify-center gap-2 border border-border py-3 text-sm font-medium text-foreground hover:border-foreground">
                <Plus className="h-4 w-4" /> Add something else
              </button>
              {onRescan && (
                <button type="button" onClick={onRescan} className="flex w-full items-center justify-center gap-2 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">
                  <RotateCcw className="h-4 w-4" /> Rescan storefront
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {step === 'next' && (
        <div className="mt-8 w-full max-w-sm space-y-3 animate-fade-in">
          <h3 className="font-display text-3xl font-bold text-foreground">Your brand profile is ready</h3>
          <p className="pb-3 text-sm leading-relaxed text-muted-foreground">
            Would you like to continue with Nova now or come back later?
          </p>
          <button type="button" disabled className={cn(ctaClass, 'cursor-not-allowed opacity-55')}>
            <Mic className="h-4 w-4" /> Call Nova now <span className="text-xs font-normal">(coming soon)</span>
          </button>
          <button type="button" onClick={onFinish} className="w-full border border-border py-4 text-sm font-medium text-foreground hover:border-foreground">
            Maybe later — continue to FormaNova
          </button>
        </div>
      )}
    </div>
  );
}
