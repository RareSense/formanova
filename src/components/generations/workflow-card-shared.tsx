// Shared helpers for the generation-history card components (CadTextCard in
// WorkflowCard.tsx and PhotoCard.tsx). Extracted into their own module so both
// files can import them without a circular dependency, and to keep each card
// file focused and under the file-size limit.

import creditCoinIcon from '@/assets/icons/credit-coin.png';

export const DISPLAY_NAME_MAX_CHARS = 50;

export function truncateDisplayName(name: string): string {
  return name.length > DISPLAY_NAME_MAX_CHARS
    ? `${name.slice(0, DISPLAY_NAME_MAX_CHARS)}...`
    : name;
}

const localDateFmt = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});
export function normalizeTimestamp(ts: string): string {
  let normalized = ts.trim();
  if (normalized && !/[Zz]$/.test(normalized) && !/[+-]\d{2}:?\d{2}$/.test(normalized)) {
    normalized += 'Z';
  }
  return normalized;
}

export function formatLocal(ts: string): string {
  return localDateFmt.format(new Date(normalizeTimestamp(ts)));
}

export type CadArtifactExtension = 'glb' | '3dm';

export function getCadArtifactBaseName(
  displayName?: string | null,
  sourceFilename = 'model.glb',
): string {
  const candidate = (displayName?.trim() || sourceFilename.trim() || 'model.glb')
    .replace(/\.(?:glb|3dm)$/i, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  return candidate || 'model';
}

export function buildCadArtifactFilename(
  displayName: string | null | undefined,
  sourceFilename: string | null | undefined,
  extension: CadArtifactExtension,
): string {
  return `${getCadArtifactBaseName(displayName, sourceFilename || 'model.glb')}.${extension}`;
}

export const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export function CreditsBadge({ credits }: { credits?: number | null }) {
  if (credits === undefined || credits === null) return null;
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] tracking-wider text-muted-foreground">
      <img src={creditCoinIcon} alt="" className="w-3.5 h-3.5" />
      {credits}
    </span>
  );
}
