/**
 * Model / Scene drawer. On-Model: My Models | Formanova Library.
 * Product Shot: My Scenes | Formanova Scenes. Same structure for both.
 *
 * single: tap a card to swap one slot (closes at once).
 * multi:  tick any number, then confirm (row edit, + Add, or Assign to Selected).
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAssigneeCatalog } from '@/hooks/useAssigneeCatalog';
import type { AssigneeKind, ShotAssignee } from '@/lib/shot-list';
import { AssigneeGrid } from './AssigneeGrid';
import { IntakeFooter } from './IntakeFooter';

const MONO = 'font-mono text-[10px] uppercase tracking-wider';

export type AssignRequest =
  | { mode: 'single'; rowId: string; oldId: string }
  | { mode: 'multi'; rowIds: string[]; initial: ShotAssignee[] };

interface AssignDrawerProps {
  request: AssignRequest | null;
  kind: AssigneeKind;
  jewelryType: string;
  onClose: () => void;
  onConfirm: (request: AssignRequest, picked: ShotAssignee[]) => void;
}

const matches = (q: string) => (a: ShotAssignee) => !q || a.name.toLowerCase().includes(q.toLowerCase());

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 items-center justify-center py-12">{children}</div>;
}

function DrawerBody({ request, kind, jewelryType, onConfirm }: Omit<AssignDrawerProps, 'onClose'> & { request: AssignRequest }) {
  const catalog = useAssigneeCatalog(kind, jewelryType);
  const multi = request.mode === 'multi';
  const noun = kind === 'model' ? 'Model' : 'Scene';
  const [tab, setTab] = useState<'mine' | 'library'>('library');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [picked, setPicked] = useState<ShotAssignee[]>(request.mode === 'multi' ? request.initial : []);
  // In swap mode the current model shows as picked so users see what they are replacing.
  const pickedIds = useMemo(
    () => new Set([...picked.map((p) => p.id), ...(request.mode === 'single' ? [request.oldId] : [])]),
    [picked, request],
  );

  useEffect(() => { if (!categoryId) setCategoryId(catalog.defaultCategoryId); }, [catalog.defaultCategoryId, categoryId]);

  const pick = (item: ShotAssignee) => {
    if (!multi) { onConfirm(request, [item]); return; }
    setPicked((prev) => (prev.some((p) => p.id === item.id) ? prev.filter((p) => p.id !== item.id) : [...prev, item]));
  };

  const onUpload = async (file: File) => {
    const added = await catalog.upload(file);
    if (added) pick(added);
  };

  const category = catalog.library.find((c) => c.id === categoryId);
  const libraryItems = (search ? catalog.library.flatMap((c) => c.items) : category?.items ?? []).filter(matches(search));
  const myItems = catalog.myItems.filter(matches(search));

  const targets = request.mode === 'multi' ? request.rowIds.length : 1;
  const ctaLabel = request.mode === 'multi' && request.rowIds.length > 1
    ? `Assign ${picked.length} to ${targets} Pieces`
    : `Save ${picked.length} ${picked.length === 1 ? noun : `${noun}s`}`;
  const unchanged = request.mode === 'multi'
    && picked.length === request.initial.length && picked.every((p, i) => p.id === request.initial[i].id);

  return (
    <>
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'mine' | 'library')} className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col gap-3 px-4 md:px-6 pt-4">
          <TabsList className="grid h-10 grid-cols-2">
            <TabsTrigger value="mine" className={MONO}>My {noun}s</TabsTrigger>
            <TabsTrigger value="library" className={MONO}>Formanova {kind === 'model' ? 'Library' : 'Scenes'}</TabsTrigger>
          </TabsList>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${noun.toLowerCase()}s`} aria-label={`Search ${noun.toLowerCase()}s`} className="h-10 pl-9" />
          </div>
          {tab === 'library' && !search && catalog.library.length > 1 && (
            <div className="-mx-4 md:-mx-6 flex gap-2 overflow-x-auto px-4 md:px-6 pb-1" role="tablist" aria-label="Category">
              {catalog.library.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={c.id === categoryId}
                  onClick={() => setCategoryId(c.id)}
                  className={`h-9 shrink-0 border px-4 ${MONO} ${
                    c.id === categoryId ? 'border-formanova-hero-accent bg-formanova-hero-accent text-primary-foreground' : 'border-border text-foreground/60 hover:text-foreground'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <TabsContent value="mine" className="mt-0 flex min-h-0 flex-1 flex-col overflow-y-auto px-4 md:px-6 py-4 data-[state=inactive]:hidden">
          {catalog.myLoading && !myItems.length ? <Centered><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></Centered> : (
            <AssigneeGrid
              items={myItems}
              pickedIds={pickedIds}
              multi={multi}
              onPick={pick}
              upload={{ label: `Upload ${noun}`, uploading: catalog.uploading, onFile: (f) => void onUpload(f) }}
            />
          )}
        </TabsContent>
        <TabsContent value="library" className="mt-0 flex min-h-0 flex-1 flex-col overflow-y-auto px-4 md:px-6 py-4 data-[state=inactive]:hidden">
          {catalog.libraryLoading ? <Centered><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></Centered>
            : catalog.libraryError ? <Centered><span className={`${MONO} text-foreground/60`}>Couldn't load the library</span></Centered>
            : libraryItems.length === 0 ? <Centered><span className={`${MONO} text-foreground/60`}>No {noun.toLowerCase()}s found</span></Centered>
            : <AssigneeGrid items={libraryItems} pickedIds={pickedIds} multi={multi} onPick={pick} />}
        </TabsContent>
      </Tabs>
      {multi && (
        <IntakeFooter label={ctaLabel} disabled={unchanged || (picked.length === 0 && request.initial.length === 0)} onClick={() => onConfirm(request, picked)} />
      )}
    </>
  );
}

export function AssignDrawer({ request, kind, jewelryType, onClose, onConfirm }: AssignDrawerProps) {
  const isMobile = useIsMobile();
  const noun = kind === 'model' ? 'Model' : 'Scene';
  const title = request?.mode === 'single' ? `Swap ${noun}` : request && request.rowIds.length > 1 ? `Assign ${noun}s` : `Choose ${noun}s`;
  const sub = request?.mode === 'multi' && request.rowIds.length > 1
    ? `${request.rowIds.length} pieces · one shot per ${noun.toLowerCase()}`
    : request?.mode === 'single' ? `Tap a ${noun.toLowerCase()} to swap` : `One shot per ${noun.toLowerCase()}`;

  return (
    <Sheet open={!!request} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side={isMobile ? 'bottom' : 'right'} className={`flex flex-col gap-0 p-0 ${isMobile ? 'h-dvh' : 'h-dvh w-full sm:max-w-xl'}`}>
        <SheetHeader className="border-b border-border px-4 md:px-6 py-4 text-left">
          <SheetTitle className="font-display text-2xl uppercase tracking-wide">{title}</SheetTitle>
          <SheetDescription className={MONO}>{sub}</SheetDescription>
        </SheetHeader>
        {request && (
          <DrawerBody key={`${kind}-${JSON.stringify(request)}`} request={request} kind={kind} jewelryType={jewelryType} onConfirm={onConfirm} />
        )}
      </SheetContent>
    </Sheet>
  );
}
