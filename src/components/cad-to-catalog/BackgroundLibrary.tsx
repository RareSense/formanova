/**
 * Photo backgrounds, picked right in the Background step (no pop-up), in two
 * tabs as on Product Shot: FormaNova (the product-shot inspirations, by
 * category) and My own (the user's uploads: the same inspiration_photo library
 * Product Shot keeps, so a background added here is in Product Shot too).
 * One click picks or unpicks; any number can be picked, each makes its own picture.
 */
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Diamond, Loader2 } from 'lucide-react';
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

const TAB = 'h-8 font-mono text-[10px] uppercase tracking-[0.15em] data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=inactive]:text-muted-foreground';
const NOTE = 'font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground text-center py-4';
const GRID = 'grid grid-cols-3 gap-1.5 max-h-60 overflow-y-auto pr-1 scrollbar-thin';

function Thumb({ item, on, disabled, onToggle }: { item: LibraryBackground; on: boolean; disabled: boolean; onToggle: () => void }) {
  const src = useAuthenticatedImage(item.url);
  return (
    <button type="button" disabled={disabled} onClick={onToggle} title={item.name} aria-pressed={on}
      className={`relative aspect-square border overflow-hidden bg-muted/20 ${on ? 'border-foreground ring-1 ring-foreground' : 'border-border hover:border-foreground/40'}`}>
      {src ? <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <Loader2 className="absolute inset-0 m-auto w-4 h-4 animate-spin text-muted-foreground/50" />}
      {on && <span className="absolute top-1 right-1 w-4 h-4 bg-foreground text-background flex items-center justify-center"><Check className="w-3 h-3" /></span>}
    </button>
  );
}

interface Props {
  chosen: Set<string>;
  onToggle: (bg: LibraryBackground) => void;
  disabled: boolean;
  onError: (message: string) => void;
}

export default function BackgroundLibrary({ chosen, onToggle, disabled, onError }: Props) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);

  // Same query key as Product Shot, so the library is fetched once for both.
  const library = useQuery({ queryKey: ['preset-inspirations'], queryFn: fetchPresetInspirations, staleTime: 5 * 60 * 1000 });
  const own = useQuery({
    queryKey: ['catalog-own-backgrounds'],
    queryFn: async () => (await fetchUserAssets('inspiration_photo', 0, 100)).items
      .filter((a) => a.thumbnail_url)
      .map((a): LibraryBackground => {
        const name = getAssetDisplayName(a) || 'My background';
        return { id: backgroundId(name, a.id), name, url: a.thumbnail_url };
      }),
  });

  const categories = library.data?.categories ?? [];
  const activeCategory = categories.find((c) => c.id === category) ?? categories[0];
  const libraryItems: LibraryBackground[] = (activeCategory?.inspirations ?? []).map((p) => ({ id: backgroundId(p.label, p.id), name: p.label, url: p.url }));
  const ownItems = own.data ?? [];

  // Upload into the user's own library (Product Shot's My Inspirations), then pick it.
  const upload = async (files: FileList | File[]) => {
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

  const uploadButton = (big: boolean) => (
    <button type="button" disabled={disabled || uploading > 0} onClick={() => fileInput.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) void upload(e.dataTransfer.files); }}
      className={`${big ? 'w-full py-8' : 'aspect-square'} border border-dashed border-border flex flex-col items-center justify-center gap-2 px-4 hover:bg-accent/20 disabled:opacity-50`}>
      {uploading ? <Loader2 className="h-9 w-9 animate-spin text-primary" /> : <Diamond className="h-9 w-9 text-primary" />}
      <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground text-center">
        {uploading ? 'Uploading…' : big ? 'Upload backgrounds' : 'Upload'}
      </span>
    </button>
  );

  return (
    <Tabs defaultValue="formanova" className="space-y-2">
      <TabsList className="w-full grid grid-cols-2 h-9 bg-muted/30">
        <TabsTrigger value="formanova" className={TAB}>FormaNova</TabsTrigger>
        <TabsTrigger value="own" className={TAB}>My own</TabsTrigger>
      </TabsList>

      <TabsContent value="formanova" className="mt-0 space-y-2">
        {library.isLoading ? <p className={NOTE}><Loader2 className="w-4 h-4 animate-spin mx-auto" /></p>
          : library.isError ? <p className={NOTE}>Library unavailable</p>
          : !categories.length ? <p className={NOTE}>No backgrounds yet</p>
          : (
            <>
              {categories.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1">
                  {categories.map((c) => (
                    <button key={c.id} type="button" onClick={() => setCategory(c.id)}
                      className={`shrink-0 h-7 px-3 font-mono text-[9px] uppercase tracking-[0.12em] border ${c.id === activeCategory?.id ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
              <div className={GRID}>
                {libraryItems.map((b) => <Thumb key={b.id} item={b} on={chosen.has(b.id)} disabled={disabled} onToggle={() => onToggle(b)} />)}
              </div>
            </>
          )}
      </TabsContent>

      <TabsContent value="own" className="mt-0">
        {own.isLoading ? <p className={NOTE}><Loader2 className="w-4 h-4 animate-spin mx-auto" /></p>
          : !ownItems.length ? uploadButton(true)
          : (
            <div className={GRID}>
              {uploadButton(false)}
              {ownItems.map((b) => <Thumb key={b.id} item={b} on={chosen.has(b.id)} disabled={disabled} onToggle={() => onToggle(b)} />)}
            </div>
          )}
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" multiple hidden
          onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.target.value = ''; }} />
      </TabsContent>
    </Tabs>
  );
}
