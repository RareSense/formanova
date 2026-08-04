import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { tintColor } from '@/lib/brand-colors';
import { INSIGHT_META, type InsightFeedKey } from '@/components/brand/brand-insight-meta';

export interface BrandFindingRowProps {
  finding: InsightFeedKey;
  /** Plain text value. Omit while the finding is still being worked out. */
  value?: string;
  /** Palette findings render their colours instead of text. */
  swatches?: string[];
  /** Dominant brand colour, used to tint the icon badge. */
  accent?: string;
  isDark?: boolean;
  /** Right-hand affordance: a check, a spinner, or an edit control. */
  trailing?: ReactNode;
  /** Replaces the value entirely, e.g. an inline edit form. */
  children?: ReactNode;
  className?: string;
  'data-testid'?: string;
}

/**
 * The single row used for every discovered brand fact, on both the live scan
 * feed and the editable review list.
 *
 * These were previously two separate components that looked almost — but not
 * quite — alike, so the same finding appeared to change shape between steps.
 * One row now serves both; only the trailing affordance differs (spinner while
 * scanning, check when found, pencil once editing is unlocked).
 */
export function BrandFindingRow({
  finding,
  value,
  swatches,
  accent,
  isDark = false,
  trailing,
  children,
  className,
  'data-testid': testId,
}: BrandFindingRowProps) {
  const meta = INSIGHT_META[finding];
  const Icon = meta.icon;
  const found = Boolean(value || swatches?.length);

  return (
    <div
      data-testid={testId}
      className={cn(
        'flex animate-fade-in items-start gap-3 border border-border bg-background/60 px-3.5 py-3 text-left',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: accent ? tintColor(accent, 0.78, isDark) : 'hsl(var(--muted))' }}
      >
        <Icon className="h-4 w-4 text-foreground/70" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {meta.label}
        </p>

        {children ?? (swatches?.length ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5" aria-label="Colors discovered so far">
            {swatches.slice(0, 6).map((hex, i) => (
              /* Square, never round. */
              <span
                key={`${hex}-${i}`}
                title={hex}
                className="h-5 w-5 shrink-0 border border-border"
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
        ) : (
          <p
            className={cn(
              'mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed',
              found ? 'text-foreground' : 'italic text-muted-foreground',
            )}
          >
            {value || 'Analyzing...'}
          </p>
        ))}
      </div>

      {trailing && <div className="flex shrink-0 items-center gap-1 pt-0.5">{trailing}</div>}
    </div>
  );
}
