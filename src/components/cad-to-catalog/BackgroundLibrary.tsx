/**
 * The photo backgrounds of Catalog from CAD, in two tabs as on Product Shot:
 * FormaNova library (the product-shot inspirations, by category) and My own
 * (the user's uploads: the same inspiration_photo library Product Shot keeps,
 * so a background added here is in Product Shot too, and the other way round).
 * Any number can be picked; each makes its own photo picture.
 */
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Diamond, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthenticatedImage } from '@/hooks/useAuthenticatedImage';
import { fetchUserAssets, getAssetDisplayName } from '@/lib/assets-api';
import { compressImageBlob } from '@/lib/image-compression';
import { normalizeImageFile } from '@/lib/image-normalize';
import { uploadToAzure } from '@/lib/microservices-api';
import { fetchPresetInspirations } from '@/lib/models-api';
import { blobToDataUrl } from '@/lib/cad-to-catalog-run';
import { backgroundId } from '@/lib/cad-to-catalog-queue';

/** One photo background, from either tab. id is file-safe: it ends up in picture names. */
export interface LibraryBackground {
  id: string;
  name: string;
  /** /api/artifacts/<sha256> proxy URL (needs the sign-in token). */
  url: string;
}

const TAB = 'font-mono text-[10px] uppercase tracking-[0.15em] data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=inactive]:text-muted-foreground transition-all';
const NOTE = 'font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground text-center py-8';

function Thumb({ item, on, disabled, onToggle }: { item: LibraryBackground; on: boolean; disabled: boolean; onToggle: () => void }) {
  const src = useAuthenticatedImage(item.url);
  return (
    <button type="button" disabled={disabled} onClick={onToggle} title={item.name} aria-pressed={on}
      className={`relative aspect-square border overflow-hidden bg-muted/20 ${on ? 'border-foreground ring-1 ring-foreground' : 'border-border hover:border-foreground/40'}`}>
      {src ? <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <Loader2 className="absolute inset-0 m-auto w-4 h-4 animate-spin text-muted-foreground/50" />}
      <span className="absolute left-0 right-0 bottom-0 bg-card/85 px-1 py-0.5 font-mono text-[8px] uppercase truncate text-left">{item.name}</span>
      {on && <span className="absolute top-1 right-1 w-4 h-4 bg-foreground text-background flex items-center justify-center"><Check className="w-3 h-3" /></span>}
    </button>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chosen: Set<string>;
  onToggle: (bg: LibraryBackground) => void;
  disabled: boolean;
  onError: (message: string) => void;
}

export default function BackgroundLibrary({ open, onOpenChange, chosen, onToggle, disabled, onError }: Props) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);

  // Same query key as Product Shot, so the library is fetched once for both.
  const library = useQuery({ queryKey: ['preset-inspirations'], queryFn: fetchPresetInspirations, enabled: open, staleTime: 5 * 60 * 1000 });
  const own = useQuery({
    queryKey: ['catalog-own-backgrounds'],
    queryFn: async () => (await fetchUserAssets('inspiration_photo', 0, 100)).items
      .filter((a) => a.thumbnail_url)
      .map((a): LibraryBackground => {
        const name = getAssetDisplayName(a) || 'My background';
        return { id: backgroundId(name, a.id), name, url: a.thumbnail_url };
      }),
    enabled: open,
  });

  const categories = library.data?.categories ?? [];
  const activeCategory = categories.find((c) => c.id === category) ?? categories[0];
  const libraryItems: LibraryBackground[] = (activeCategory?.inspirations ?? []).map((p) => ({ id: backgroundId(p.label, p.id), name: p.label, url: p.url }));

  // Upload into the user's own library (Product Shot's My Inspirations), then pick it.
  const upload = async (files: FileList) => {
    for (const file of Array.from(files)) {
      setUploading((n) => n + 1);
      try {
        const { blob } = await compressImageBlob(await normalizeImageFile(file));
        const name = file.name.replace(/\.[^.]+$/, '');
        const saved = await uploadToAzure(await blobToDataUrl(blob), 'image/jpeg', 'inspiration_photo', { name });
        const url = saved.sas_url || saved.https_url;
        if (saved.asset_id && url) onToggle({ id: backgroundId(name, saved.asset_id), name, url });
      } catch (e) {
        onError(`${file.name}: could not upload (${(e as Error).message})`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    queryClient.invalidateQueries({ queryKey: ['catalog-own-backgrounds'] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[85vh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="font-display text-xl uppercase tracking-wide">Background library</DialogTitle>
          <DialogDescription className="font-mono text-[10px] uppercase tracking-[0.12em] text-justify">
            Pick any number of photo backgrounds; each makes its own picture of every piece.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="formanova" className="flex-1 min-h-0 flex flex-col">
          <TabsList className="w-full grid grid-cols-2 mb-3 bg-muted/30 h-11 shrink-0">
            <TabsTrigger value="formanova" className={TAB}>FormaNova library</TabsTrigger>
            <TabsTrigger value="own" className={TAB}>My own</TabsTrigger>
          </TabsList>

          <TabsContent value="formanova" className="flex-1 min-h-0 mt-0 flex flex-col gap-2">
            {library.isLoading ? <p className={NOTE}><Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" />Loading the library</p>
              : library.isError ? <p className={NOTE}>The library is unavailable</p>
              : !categories.length ? <p className={NOTE}>No backgrounds in the library yet</p>
              : (
                <>
                  <div className="flex flex-wrap gap-1.5 shrink-0">
                    {categories.map((c) => (
                      <button key={c.id} type="button" onClick={() => setCategory(c.id)}
                        className={`h-8 px-4 font-mono text-[10px] uppercase tracking-[0.12em] border ${c.id === activeCategory?.id ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <div className="overflow-y-auto min-h-0 grid grid-cols-3 sm:grid-cols-4 gap-2 pr-1">
                    {libraryItems.map((b) => <Thumb key={b.id} item={b} on={chosen.has(b.id)} disabled={disabled} onToggle={() => onToggle(b)} />)}
                  </div>
                </>
              )}
          </TabsContent>

          <TabsContent value="own" className="flex-1 min-h-0 mt-0 overflow-y-auto pr-1">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              <button type="button" disabled={disabled || uploading > 0} onClick={() => fileInput.current?.click()}
                className="aspect-square border border-dashed border-border flex flex-col items-center justify-center gap-2 px-4 hover:bg-accent/20 disabled:opacity-50">
                {uploading ? <Loader2 className="h-9 w-9 animate-spin text-primary" /> : <Diamond className="h-9 w-9 text-primary" />}
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground text-center">{uploading ? 'Uploading…' : 'Upload'}</span>
              </button>
              {(own.data ?? []).map((b) => <Thumb key={b.id} item={b} on={chosen.has(b.id)} disabled={disabled} onToggle={() => onToggle(b)} />)}
            </div>
            {own.isLoading && <p className={NOTE}><Loader2 className="w-4 h-4 animate-spin mx-auto" /></p>}
            {!own.isLoading && !own.data?.length && <p className={NOTE}>Saved here for every shoot, and in Product Shot too</p>}
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" multiple hidden
              onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.target.value = ''; }} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
