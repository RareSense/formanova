/**
 * Right panel of Catalog from CAD: the piece's parts (one row per set of
 * identical pieces) and its materials. With nothing selected a metal goes on
 * every metal part and a stone on every stone; with parts selected, on those.
 */
import { useMemo } from 'react';
import type { CadPanelSection } from '@/components/text-to-cad/CadWorkspaceLayout';
import type { CatalogEngine } from './engine/engine';
import { GEMS, METALS, PRESETS, swatchColor, type Choice } from './engine/materials';
import { useEngineState } from './useEngineState';

const HEAD = 'flex items-center justify-between px-4 py-3 border-b border-border';
const TITLE = 'font-display text-base tracking-[0.12em] uppercase text-foreground';
const LABEL = 'font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground';
const ball = (c: string, gem: boolean) => `radial-gradient(circle at 35% 30%, #fff 0 ${gem ? 12 : 8}%, ${c} ${gem ? 45 : 40}%, ${gem ? '#223' : '#3a3328'} 100%)`;
const same = (a: Choice | null | undefined, b: Choice | null | undefined) => (a?.id ?? null) === (b?.id ?? null);

interface Props {
  engine: CatalogEngine | null;
  section?: CadPanelSection;
  /** While shooting, materials stay as they are. */
  locked: boolean;
}

export default function PartsPanel({ engine, section, locked }: Props) {
  const state = useEngineState(engine);
  const byId = useMemo(() => new Map(state.parts.map((p) => [p.id, p])), [state.parts]);
  const sel = [...state.selected].map((id) => byId.get(id)!).filter(Boolean);
  const common = (list: typeof sel) => (list.length && list.every((p) => same(p.choice, list[0].choice)) ? list[0].choice : undefined);
  const cur = sel.length ? common(sel) : undefined;
  const curMetal = sel.length ? cur : common(state.parts.filter((p) => p.group === 'metal'));
  const curGem = sel.length ? cur : common(state.parts.filter((p) => p.group === 'stone'));
  const hasMetal = state.parts.some((p) => p.group === 'metal');
  const hasStones = state.parts.some((p) => p.group === 'stone');
  const metalSelected = cur && PRESETS.get(cur.id)?.kind === 'metal';
  const rough = metalSelected ? cur.rough ?? PRESETS.get(cur.id)!.roughness! : 0;

  if (!state.parts.length) {
    return <div className="flex h-full items-center justify-center p-6 bg-card border-l border-border"><span className={LABEL}>Open a CAD file to see its parts</span></div>;
  }

  const parts = (
    <div className="flex flex-col min-h-0">
      <div className={HEAD}><span className={TITLE}>Parts</span><span className="font-mono text-[10px] text-muted-foreground">{state.sets.length}</span></div>
      <div className="flex gap-1.5 px-4 pt-3">
        <button type="button" disabled={!hasMetal || locked} onClick={() => engine?.selectGroup('metal')} className="flex-1 h-8 px-4 border border-border font-mono text-[10px] uppercase tracking-[0.12em] hover:bg-accent/50 disabled:opacity-30">All metal</button>
        <button type="button" disabled={!hasStones || locked} onClick={() => engine?.selectGroup('stone')} className="flex-1 h-8 px-4 border border-border font-mono text-[10px] uppercase tracking-[0.12em] hover:bg-accent/50 disabled:opacity-30">All stones</button>
      </div>
      <ul className="overflow-y-auto min-h-0 max-h-[40vh] px-4 py-3 space-y-1 scrollbar-thin">
        {state.sets.map((s) => {
          const first = byId.get(s.ids[0])!;
          const on = s.ids.some((id) => state.selected.has(id));
          return (
            <li key={s.key}>
              <button
                type="button"
                disabled={locked}
                onClick={(e) => engine?.select(s.ids, e.shiftKey || e.ctrlKey || e.metaKey)}
                title={s.ids.length > 1 ? `${s.name} (${s.ids.length} identical pieces)` : s.name}
                className={`w-full flex items-center gap-2 px-2.5 py-2 border text-left transition-colors ${on ? 'border-foreground bg-accent/40' : 'border-border hover:bg-accent/20'}`}
              >
                <span className="w-3.5 h-3.5 shrink-0 border border-border" style={{ background: swatchColor(first.choice, first.source.color) }} />
                <span className="flex-1 min-w-0 truncate font-mono text-[11px]">{s.name}</span>
                {s.ids.length > 1 && <span className="font-mono text-[10px] text-muted-foreground">×{s.ids.length}</span>}
                <span className="font-mono text-[9px] uppercase text-muted-foreground">{s.group === 'stone' ? 'stone' : s.group === 'metal' ? 'metal' : ''}</span>
              </button>
            </li>
          );
        })}
        {(state.info?.rhino?.noMeshNames || []).map((n) => (
          <li key={`nomesh-${n}`} className="px-2.5 py-2 border border-dashed border-border font-mono text-[11px] text-muted-foreground" title="Saved in Rhino without a display mesh, so it can't be drawn. In Rhino: run _Mesh, or save with 'Save small' off, then open it again.">
            {n} · no mesh
          </li>
        ))}
      </ul>
    </div>
  );

  const tile = (id: string, name: string, color: string, gem: boolean, on: boolean) => (
    <button
      key={id}
      type="button"
      disabled={locked}
      onClick={() => engine?.choose({ kind: 'preset', id })}
      title={name}
      className={`py-2 px-1.5 text-center transition-all border ${on ? 'border-foreground bg-accent/40' : 'border-border/50 bg-muted/20 hover:bg-accent/50'} disabled:opacity-30`}
    >
      <span className="block mx-auto mb-1 w-6 h-6 rounded-full" style={{ background: ball(color, gem) }} />
      <span className="block text-[8px] truncate font-mono font-semibold leading-tight">{name}</span>
    </button>
  );

  const materials = (
    <div className="flex flex-col min-h-0">
      <div className={HEAD}><span className={TITLE}>Material</span><span className="font-mono text-[10px] text-muted-foreground">{sel.length ? `${sel.length} selected` : 'whole piece'}</span></div>
      <div className="overflow-y-auto min-h-0 px-4 py-3 space-y-3 scrollbar-thin">
        <p className="font-mono text-[10px] leading-relaxed text-muted-foreground text-justify">
          {sel.length ? 'For the selected parts.' : 'For the whole piece, or select parts first.'}
        </p>
        <div className={LABEL}>Metal{sel.length ? '' : ' · all metal parts'}</div>
        <div className="grid grid-cols-4 gap-1.5">{METALS.map((m) => tile(m.id, m.name, m.color, false, same(curMetal, { kind: 'preset', id: m.id })))}</div>
        <div className={LABEL}>Stones{sel.length ? '' : ' · all stones'}</div>
        <div className="grid grid-cols-4 gap-1.5">{GEMS.map((m) => tile(m.id, m.name, m.color, true, same(curGem, { kind: 'preset', id: m.id })))}</div>
        {sel.some((p) => !p.source.isDefault) && (
          <button type="button" disabled={locked} onClick={() => engine?.choose(null)} className="w-full h-8 px-4 border border-border font-mono text-[10px] uppercase tracking-[0.12em] hover:bg-accent/50 disabled:opacity-30">
            As in the file
          </button>
        )}
        {metalSelected && (
          <div className="space-y-1.5">
            <div className={LABEL}>Polish</div>
            <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
              <span>Satin</span>
              <input
                type="range" min={0} max={50} step={1} value={50 - Math.round(rough * 100)} disabled={locked}
                aria-label="Polish, from satin to mirror"
                className="flex-1 accent-[hsl(var(--formanova-hero-accent))]"
                onPointerDown={() => engine?.beginAdjust()}
                onChange={(e) => engine?.adjust('rough', (50 - +e.target.value) / 100)}
              />
              <span>Mirror</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (section === 'parts') return <div className="flex flex-col h-full bg-card">{parts}</div>;
  if (section === 'material') return <div className="flex flex-col h-full bg-card">{materials}</div>;
  return (
    <div className="flex flex-col h-full bg-card border-l border-border min-h-0">
      {parts}
      <div className="border-t border-border flex-1 min-h-0 flex flex-col">{materials}</div>
    </div>
  );
}
