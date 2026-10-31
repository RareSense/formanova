/**
 * The shoot settings, in the tool's order: 1 jewellery type (of the open
 * piece), 2 angles, 3 metals, 4 backgrounds, 5 picture size, 6 aspect ratio
 * (photo backgrounds); then Shoot, with what the shoot costs.
 * They apply to every piece; each piece uses its own type's angles.
 */
import type { ReactNode } from 'react';
import { Check, Pause, Play, Plus, Square } from 'lucide-react';
import creditCoinIcon from '@/assets/icons/credit-coin.png';
import { CATALOG_RESOLUTIONS, type CatalogAspect, type CatalogResolution } from '@/lib/cad-to-catalog-api';
import { CATEGORIES, CATEGORY_LABEL, type BackgroundId, type JewelryCategory, type PlannedAngle } from '@/lib/cad-to-catalog-queue';
import { METALS } from './engine/materials';

const STEP = 'font-display text-sm tracking-[0.15em] uppercase font-bold flex items-center gap-2';
const NUM = 'w-5 h-5 flex items-center justify-center border border-foreground font-mono text-[10px]';
const TICK = (on: boolean) => `w-4 h-4 flex items-center justify-center border ${on ? 'bg-foreground border-foreground text-background' : 'border-border'}`;
/** The CAD to Pictures tool's shapes. */
const SHAPES: CatalogAspect[] = ['1:1', '4:5', '3:4', '2:3', '16:9', '9:16'];
const RESOLUTION_LABEL: Record<CatalogResolution, string> = { '1K': 'Standard HD', '2K': 'High Res', '4K': 'Ultra HD' };
const CHIP = (on: boolean) => `flex items-center gap-2 px-2.5 py-2 border text-left font-mono text-[10px] transition-colors ${on ? 'border-foreground bg-accent/40' : 'border-border hover:bg-accent/20'}`;

interface Props {
  category: JewelryCategory | null;
  onCategory: (c: JewelryCategory) => void;
  angles: PlannedAngle[];
  skipped: Set<string>;
  onToggleAngle: (name: string) => void;
  onGoToAngle: (a: PlannedAngle) => void;
  onAddView: () => void;
  ownAngles: boolean;
  anglesChanged: boolean;
  onSaveAngles: () => void;
  onResetAngles: () => void;
  metals: Set<string>;
  onToggleMetal: (name: string) => void;
  chosenBackgrounds: Set<BackgroundId>;
  onToggleBackground: (id: BackgroundId) => void;
  /** The photo backgrounds picker (FormaNova / My own), shown under White. */
  photoPicker: ReactNode;
  photoCount: number;
  onClearPhotos: () => void;
  aspect: CatalogAspect;
  onAspect: (a: CatalogAspect) => void;
  resolution: CatalogResolution;
  onResolution: (r: CatalogResolution) => void;
  /** Pictures one piece gets, photos among them (for the button and the credit note). */
  perPiece: { pictures: number; photos: number };
  pieceCount: number;
  /** Pictures a Shoot all makes (each piece with its own type's angles). */
  totalPictures: number;
  /** Credits a Shoot all costs; null while the price is being looked up. */
  totalCredits: number | null;
  canShoot: boolean;
  running: boolean;
  paused: boolean;
  onShootAll: () => void;
  onShootOpen: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export default function ShootSteps(p: Props) {
  const photos = [...p.chosenBackgrounds].some((b) => b !== 'white' && b !== 'transparent');
  const disabled = p.running;
  return (
    <section aria-label="Shoot" className="flex flex-col gap-4 px-4 py-4">
      <div className="space-y-2">
        <h3 className={STEP}><span className={NUM}>1</span>Jewellery type</h3>
        <select
          value={p.category ?? ''}
          disabled={!p.category || disabled}
          onChange={(e) => p.onCategory(e.target.value as JewelryCategory)}
          aria-label="Jewellery type of the open piece"
          className="w-full h-9 px-2 bg-background border border-border font-mono text-[11px]"
        >
          {!p.category && <option value="">Open a piece first</option>}
          {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        <h3 className={STEP}><span className={NUM}>2</span>Angles</h3>
        <div className="grid grid-cols-2 gap-1.5">
          {p.angles.map((a) => {
            const on = !p.skipped.has(a.name);
            return (
              <div key={a.name} className={CHIP(on)}>
                <button type="button" disabled={disabled} onClick={() => p.onToggleAngle(a.name)} aria-label={`${on ? 'Skip' : 'Shoot'} ${a.name}`} className={TICK(on)}>{on && <Check className="w-3 h-3" />}</button>
                <button type="button" disabled={disabled} onClick={() => p.onGoToAngle(a)} className="flex-1 min-w-0 truncate text-left" title={`Look from ${a.name}`}>{a.name}</button>
              </div>
            );
          })}
        </div>
        <div className="flex gap-1.5">
          <button type="button" disabled={disabled || !p.category} onClick={p.onAddView} className="flex-1 h-8 px-4 flex items-center justify-center gap-1 border border-border font-mono text-[10px] uppercase tracking-[0.12em] hover:bg-accent/50 disabled:opacity-30">
            <Plus className="w-3 h-3" /> This view
          </button>
          {p.anglesChanged && <button type="button" disabled={disabled} onClick={p.onSaveAngles} className="flex-1 h-8 px-4 border border-border font-mono text-[10px] uppercase tracking-[0.12em] hover:bg-accent/50">Save as default</button>}
          {(p.ownAngles || p.anglesChanged) && <button type="button" disabled={disabled} onClick={p.onResetAngles} className="h-8 px-4 border border-border font-mono text-[10px] uppercase tracking-[0.12em] hover:bg-accent/50">Reset</button>}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className={STEP}><span className={NUM}>3</span>Metals</h3>
        <div className="grid grid-cols-2 gap-1.5">
          {METALS.map((m) => {
            const on = p.metals.has(m.name);
            return (
              <button key={m.id} type="button" disabled={disabled} onClick={() => p.onToggleMetal(m.name)} className={CHIP(on)}>
                <span className={TICK(on)}>{on && <Check className="w-3 h-3" />}</span>
                <span className="w-3 h-3 shrink-0 rounded-full" style={{ background: `radial-gradient(circle at 35% 30%, #fff 0 8%, ${m.color} 40%, #3a3328 100%)` }} />
                <span className="truncate">{m.name}</span>
              </button>
            );
          })}
        </div>
        {!p.metals.size && <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">None: each piece keeps its own metal.</p>}
      </div>

      <div className="space-y-2">
        <h3 className={STEP}><span className={NUM}>4</span>Background</h3>
        <button type="button" disabled={disabled} onClick={() => p.onToggleBackground('white')} aria-pressed={p.chosenBackgrounds.has('white')}
          className={`w-full ${CHIP(p.chosenBackgrounds.has('white'))}`}>
          <span className={TICK(p.chosenBackgrounds.has('white'))}>{p.chosenBackgrounds.has('white') && <Check className="w-3 h-3" />}</span>
          <span className="w-3 h-3 shrink-0 border border-border bg-white" />
          <span>White</span>
        </button>
        {p.photoPicker}
        {p.photoCount > 0 && (
          <div className="flex items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
            <span>{p.photoCount} photo {p.photoCount === 1 ? 'background' : 'backgrounds'} · placed by AI</span>
            <button type="button" disabled={disabled} onClick={p.onClearPhotos} className="h-7 px-3 border border-border hover:bg-accent/50">Clear</button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className={STEP}><span className={NUM}>5</span>Picture size</h3>
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Resolution of the pictures">
            {CATALOG_RESOLUTIONS.map((r) => (
              <button key={r} type="button" role="radio" aria-checked={p.resolution === r} disabled={disabled} onClick={() => p.onResolution(r)}
                className={`h-11 px-4 flex flex-col items-center justify-center gap-0.5 border font-mono uppercase transition-colors disabled:opacity-40 ${p.resolution === r ? 'border-foreground bg-accent/40' : 'border-border hover:bg-accent/20'}`}>
                <span className="text-[11px] tracking-[0.12em]">{r}</span>
                <span className="text-[8px] tracking-[0.08em] text-muted-foreground whitespace-nowrap">{RESOLUTION_LABEL[r]}</span>
              </button>
            ))}
          </div>
          {p.resolution === '4K' && <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">4K takes longer.</p>}
      </div>

      {/* As in the CAD to Pictures tool: always shown, one click; only photo pictures take the shape. */}
      <div className="space-y-2">
        <h3 className={STEP}><span className={NUM}>6</span>Aspect ratio</h3>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Aspect ratio of the photo pictures">
          {SHAPES.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={p.aspect === a} disabled={disabled} onClick={() => p.onAspect(a)}
              className={`h-9 px-4 border font-mono text-[11px] transition-colors disabled:opacity-40 ${p.aspect === a ? 'border-foreground bg-accent/40' : 'border-border hover:bg-accent/20'}`}>
              {a}
            </button>
          ))}
        </div>
        {!photos && <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">For photo backgrounds; white stays square.</p>}
      </div>

      {!p.running ? (
        <div className="space-y-1.5 pt-1">
          <button type="button" disabled={!p.canShoot || p.pieceCount === 0} onClick={p.onShootAll}
            title={`${p.pieceCount} ${p.pieceCount === 1 ? 'piece' : 'pieces'}`}
            className="w-full h-12 px-4 flex items-center justify-center gap-2 whitespace-nowrap bg-formanova-hero-accent text-primary-foreground font-mono text-[11px] uppercase tracking-[0.15em] disabled:opacity-40">
            <span>{p.pieceCount > 1 ? 'Shoot all' : 'Shoot'} · {p.totalPictures} {p.totalPictures === 1 ? 'picture' : 'pictures'}</span>
            {p.totalCredits !== null && p.totalPictures > 0 && (
              <span className="flex items-center gap-1" aria-label={`${p.totalCredits} credits`}>
                <img src={creditCoinIcon} alt="" className="w-4 h-4" />{p.totalCredits}
              </span>
            )}
          </button>
          {p.pieceCount > 1 && (
            <button type="button" disabled={!p.canShoot} onClick={p.onShootOpen} className="w-full h-9 px-6 border border-border font-mono text-[10px] uppercase tracking-[0.15em] hover:bg-accent/50 disabled:opacity-40">
              Only the open piece · {p.perPiece.pictures}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          {p.paused
            ? <button type="button" onClick={p.onResume} className="h-11 px-4 flex items-center justify-center gap-2 bg-formanova-hero-accent text-primary-foreground font-mono text-[11px] uppercase tracking-[0.15em]"><Play className="w-4 h-4" /> Resume</button>
            : <button type="button" onClick={p.onPause} className="h-11 px-4 flex items-center justify-center gap-2 border border-foreground font-mono text-[11px] uppercase tracking-[0.15em]"><Pause className="w-4 h-4" /> Pause</button>}
          <button type="button" onClick={p.onStop} className="h-11 px-4 flex items-center justify-center gap-2 border border-foreground font-mono text-[11px] uppercase tracking-[0.15em]"><Square className="w-4 h-4" /> Stop</button>
        </div>
      )}
    </section>
  );
}
