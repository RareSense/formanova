/**
 * Past Jewelry: earlier uploads for this jewelry type as Product Groups
 * (multi-angle sets stay together). Multi-select, then add.
 */
import { useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUserAssets } from '@/hooks/useUserAssets';
import { useAuthenticatedImage } from '@/hooks/useAuthenticatedImage';
import { newId } from '@/hooks/useShotList';
import { buildVaultCards } from '@/components/studio/VaultProductCards';
import { TO_SINGULAR } from '@/lib/jewelry-utils';
import { getAssetDisplayName, type UserAsset } from '@/lib/assets-api';
import { MAX_ANGLES_PER_PIECE, type ShotAngle } from '@/lib/shot-list';
import { IntakeFooter } from './IntakeFooter';

const PAGE_SIZE = 60;
const MONO = 'font-mono text-[10px] uppercase tracking-wider';

interface PastGroup { key: string; members: UserAsset[] }

/** Equal angles in upload order, capped at the per-piece limit. */
function toGroups(assets: UserAsset[]): PastGroup[] {
  return buildVaultCards(assets).map((c) => ({
    key: c.groupId ?? c.cover.id,
    members: [...c.members]
      .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
      .slice(0, MAX_ANGLES_PER_PIECE),
  }));
}

function toAngles(group: PastGroup): ShotAngle[] {
  return group.members.map((a) => ({
    id: newId(),
    previewUrl: a.thumbnail_url,
    assetId: a.id,
    url: a.url ?? a.artifact_url ?? undefined,
  }));
}

function GroupCard({ group, selected, onToggle }: { group: PastGroup; selected: boolean; onToggle: () => void }) {
  const first = group.members[0];
  const src = useAuthenticatedImage(first.thumbnail_url);
  const n = group.members.length;
  const name = getAssetDisplayName(first);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label={name}
      onClick={onToggle}
      className={`relative flex min-w-0 flex-col border text-left transition-colors ${
        selected ? 'border-formanova-hero-accent' : 'border-border hover:border-foreground/40'
      }`}
    >
      <div className="aspect-square w-full bg-muted">
        {src && <img src={src} alt="" draggable={false} className="h-full w-full object-cover" />}
      </div>
      <span
        className={`absolute left-2 top-2 flex h-5 w-5 items-center justify-center border ${
          selected ? 'border-formanova-hero-accent bg-formanova-hero-accent text-primary-foreground' : 'border-border bg-background/85'
        }`}
      >
        {selected && <Check className="h-3.5 w-3.5" />}
      </span>
      {n > 1 && (
        <span className={`absolute right-2 top-2 bg-background/85 px-1.5 py-0.5 ${MONO}`}>{n} angles</span>
      )}
      <span className={`truncate px-2 py-1.5 ${MONO}`}>{name}</span>
    </button>
  );
}

export function IntakePastTab({
  jewelryType, onAdd,
}: { jewelryType: string; onAdd: (pieces: ShotAngle[][]) => void }) {
  const category = TO_SINGULAR[jewelryType] ?? jewelryType;
  const { assets, total, page, isLoading, error, goToPage, refresh } = useUserAssets('jewelry_photo', PAGE_SIZE, category);
  const groups = useMemo(() => toGroups(assets), [assets]);
  const [selected, setSelected] = useState<Map<string, PastGroup>>(new Map());
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggle = (g: PastGroup) => setSelected((prev) => {
    const next = new Map(prev);
    if (next.has(g.key)) next.delete(g.key); else next.set(g.key, g);
    return next;
  });

  const submit = () => {
    onAdd([...selected.values()].map(toAngles));
    setSelected(new Map());
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 md:px-6 py-4">
        {isLoading && groups.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
            <span className={`${MONO} text-foreground/60`}>Couldn't load past jewelry</span>
            <Button variant="outline" onClick={refresh} className={`h-10 px-6 ${MONO}`}>Try again</Button>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-12">
            <span className={`${MONO} text-foreground/60`}>No past uploads for this type yet</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {groups.map((g) => (
                <GroupCard key={g.key} group={g} selected={selected.has(g.key)} onToggle={() => toggle(g)} />
              ))}
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Previous page" disabled={page === 0 || isLoading} onClick={() => goToPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className={`${MONO} w-20 text-center text-foreground/60`}>{page + 1} / {pages}</span>
                <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Next page" disabled={page + 1 >= pages || isLoading} onClick={() => goToPage(page + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      <IntakeFooter
        label={selected.size ? `Add ${selected.size} Selected to Shot List` : 'Add Selected to Shot List'}
        disabled={selected.size === 0}
        onClick={submit}
      />
    </>
  );
}
