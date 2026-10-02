import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronRight } from "lucide-react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import type { MeshItemData } from "./types";
import { MATERIAL_LIBRARY } from "@/components/cad-studio/materials";
import MaterialSphere from "@/components/cad-studio/MaterialSphere";
import { groupCadParts } from "@/lib/cad-part-families";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const METAL_MATERIALS = MATERIAL_LIBRARY.filter((m) => m.category === "metal");
const GEM_MATERIALS = MATERIAL_LIBRARY.filter((m) => m.category === "gemstone");

interface MeshPanelProps {
  meshes: MeshItemData[];
  onSelectMesh: (name: string, multi: boolean) => void;
  onAction: (action: string) => void;
  onApplyMaterial: (matId: string) => void;
  onApplyMetalToAll?: (matId: string) => void;
  onSelectFamily?: (name: string, multi: boolean) => void;
  onHoverPart?: (name: string | null) => void;
  onApplyGemToAll?: (matId: string) => void;
  onSceneAction: (action: string) => void;
}

export default function MeshPanel({ meshes, onSelectMesh, onAction, onApplyMaterial, onApplyMetalToAll, onSelectFamily, onHoverPart, onApplyGemToAll, onSceneAction }: MeshPanelProps) {
  const [search, setSearch] = useState("");
  const [matTab, setMatTab] = useState<"metal" | "gemstone">("metal");
  const [meshCollapsed, setMeshCollapsed] = useState(false);
  const [materialCollapsed, setMaterialCollapsed] = useState(false);

  const selectedMeshes = useMemo(() => meshes.filter(m => m.selected), [meshes]);
  const hasSelection = selectedMeshes.length > 0;

  const totalVerts = useMemo(() => meshes.reduce((s, m) => s + m.verts, 0), [meshes]);
  const filtered = useMemo(
    () => meshes.filter((m) => m.name.toLowerCase().includes(search.toLowerCase())),
    [meshes, search]
  );

  const filteredMaterials = useMemo(() => {
    return MATERIAL_LIBRARY.filter(m => m.category === matTab);
  }, [matTab]);

  const meshSubtitle = meshes.length > 0 ? `${meshes.length} · ${totalVerts.toLocaleString()}v` : "—";

  // Both collapsed
  if (materialCollapsed && meshCollapsed) {
    return (
      <div className="flex flex-col bg-card border-l border-border h-full">
        <SectionHeader title="Material" subtitle={hasSelection ? `${selectedMeshes.length} sel` : ""} collapsed onToggle={() => setMaterialCollapsed(false)} />
        <SectionHeader title="Parts" subtitle={meshSubtitle} collapsed onToggle={() => setMeshCollapsed(false)} />
        <div className="flex-1" />
      </div>
    );
  }

  if (materialCollapsed) {
    return (
      <div className="flex flex-col bg-card border-l border-border h-full">
        <SectionHeader title="Material" subtitle={hasSelection ? `${selectedMeshes.length} sel` : ""} collapsed onToggle={() => setMaterialCollapsed(false)} />
        <div className="flex-1 flex flex-col min-h-0 border-t border-border">
          <SectionHeader title="Parts" subtitle={meshSubtitle} collapsed={false} onToggle={() => setMeshCollapsed(true)} />
          <MeshList search={search} setSearch={setSearch} filtered={filtered} meshes={meshes} onSelectMesh={onSelectMesh} onSelectFamily={onSelectFamily} onHoverPart={onHoverPart} />
        </div>
      </div>
    );
  }

  if (meshCollapsed) {
    return (
      <div className="flex flex-col bg-card border-l border-border h-full">
        <div className="flex-1 flex flex-col min-h-0">
          <MaterialSectionHeader collapsed={false} onToggle={() => setMaterialCollapsed(true)} hasSelection={hasSelection} selectedMeshes={selectedMeshes} />
          <MaterialContent hasSelection={hasSelection} matTab={matTab} setMatTab={setMatTab} filteredMaterials={filteredMaterials} onApplyMaterial={onApplyMaterial} onApplyMetalToAll={onApplyMetalToAll} onApplyGemToAll={onApplyGemToAll} />
        </div>
        <SectionHeader title="Parts" subtitle={meshSubtitle} collapsed onToggle={() => setMeshCollapsed(false)} />
      </div>
    );
  }

  // Both expanded
  return (
    <div className="flex flex-col bg-card border-l border-border h-full">
      <ResizablePanelGroup direction="vertical" className="flex-1 min-h-0">
        <ResizablePanel defaultSize={50} minSize={20}>
          <div className="flex flex-col h-full">
            <MaterialSectionHeader collapsed={false} onToggle={() => setMaterialCollapsed(true)} hasSelection={hasSelection} selectedMeshes={selectedMeshes} />
            <MaterialContent hasSelection={hasSelection} matTab={matTab} setMatTab={setMatTab} filteredMaterials={filteredMaterials} onApplyMaterial={onApplyMaterial} onApplyMetalToAll={onApplyMetalToAll} onApplyGemToAll={onApplyGemToAll} />
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={50} minSize={20}>
          <div className="flex flex-col h-full">
            <SectionHeader title="Parts" subtitle={meshSubtitle} collapsed={false} onToggle={() => setMeshCollapsed(true)} />
            <MeshList search={search} setSearch={setSearch} filtered={filtered} meshes={meshes} onSelectMesh={onSelectMesh} onSelectFamily={onSelectFamily} onHoverPart={onHoverPart} />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

// ── Section header ──
function SectionHeader({ title, subtitle, collapsed, onToggle }: {
  title: string; subtitle: string; collapsed: boolean; onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-3 cursor-pointer transition-colors duration-150 hover:bg-accent/20 border-b border-border flex-shrink-0"
    >
      <span className="font-display text-sm tracking-[0.15em] text-foreground uppercase font-bold">{title}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-muted-foreground">{subtitle}</span>
        {collapsed ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />}
      </span>
    </button>
  );
}

// ── Material section header ──
function MaterialSectionHeader({ collapsed, onToggle, hasSelection, selectedMeshes }: {
  collapsed: boolean; onToggle: () => void; hasSelection: boolean; selectedMeshes: MeshItemData[];
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-3 cursor-pointer transition-colors duration-150 hover:bg-accent/20 border-b border-border flex-shrink-0"
    >
      <span className="font-display text-sm tracking-[0.15em] text-foreground uppercase font-bold">Material</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-muted-foreground">
          {hasSelection ? `${selectedMeshes.length} sel` : ""}
        </span>
        {collapsed ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />}
      </span>
    </button>
  );
}

// ── Material content ──
function MaterialContent({ hasSelection, matTab, setMatTab, filteredMaterials, onApplyMaterial, onApplyMetalToAll, onApplyGemToAll }: {
  hasSelection: boolean;
  matTab: "metal" | "gemstone"; setMatTab: (t: "metal" | "gemstone") => void;
  filteredMaterials: typeof MATERIAL_LIBRARY;
  onApplyMaterial: (matId: string) => void;
  onApplyMetalToAll?: (matId: string) => void;
  onApplyGemToAll?: (matId: string) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-3 pt-3 space-y-3 scrollbar-thin">
      {onApplyMetalToAll && (
        <div className="space-y-1.5">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">All metal parts</div>
          {/* Value stays empty so picking the same metal again re-applies it. */}
          <Select value="" onValueChange={onApplyMetalToAll}>
            <SelectTrigger className="h-8 font-mono text-[11px]" aria-label="Apply one metal to all metal parts">
              <SelectValue placeholder="Choose a metal…" />
            </SelectTrigger>
            <SelectContent>
              {METAL_MATERIALS.map((m) => (
                <SelectItem key={m.id} value={m.id} className="font-mono text-[11px]">
                  <span className="flex items-center gap-2">
                    <MaterialSphere category={m.category} preview={m.preview} size={14} />
                    {m.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {onApplyGemToAll && (
        <div className="space-y-1.5">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">All stones</div>
          <Select value="" onValueChange={onApplyGemToAll}>
            <SelectTrigger className="h-8 font-mono text-[11px]" aria-label="Apply one gem to all stones">
              <SelectValue placeholder="Choose a gem…" />
            </SelectTrigger>
            <SelectContent>
              {GEM_MATERIALS.map((m) => (
                <SelectItem key={m.id} value={m.id} className="font-mono text-[11px]">
                  <span className="flex items-center gap-2">
                    <MaterialSphere category={m.category} preview={m.preview} size={14} />
                    {m.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {!hasSelection && (
        <div className="px-3 py-2 font-mono text-[10px] text-muted-foreground bg-muted/40 border border-border">
          Select a part to assign material
        </div>
      )}
      <div className="flex gap-0 border border-border">
        {(["metal", "gemstone"] as const).map(cat => (
          <button
            key={cat}
            onClick={() => setMatTab(cat)}
            className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors duration-150 ${
              matTab === cat ? "text-primary-foreground bg-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {cat === "metal" ? "Metals" : "Gems"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {filteredMaterials.map((m) => (
          <button
            key={m.id}
            onClick={() => onApplyMaterial(m.id)}
            disabled={!hasSelection}
            className="py-2 px-1.5 text-center cursor-pointer transition-all duration-200 hover:bg-accent/50 hover:text-foreground active:scale-[0.97] bg-muted/20 border border-border/50 disabled:opacity-30 disabled:cursor-not-allowed group"
          >
            <div className="flex justify-center mb-1">
              <MaterialSphere category={m.category} preview={m.preview} size={24} />
            </div>
            <div className="text-[8px] truncate font-mono font-semibold text-muted-foreground group-hover:text-foreground leading-tight">{m.name}</div>
          </button>
        ))}
        {filteredMaterials.length === 0 && (
          <div className="col-span-3 text-center font-mono text-[10px] text-muted-foreground/50 py-4">
            No materials match
          </div>
        )}
      </div>
    </div>
  );
}

// ── Parts list ──
function MeshList({ search, setSearch, filtered, meshes, onSelectMesh, onSelectFamily, onHoverPart }: {
  search: string; setSearch: (v: string) => void;
  filtered: MeshItemData[];
  meshes: MeshItemData[];
  onSelectMesh: (name: string, multi: boolean) => void;
  onSelectFamily?: (name: string, multi: boolean) => void;
  onHoverPart?: (name: string | null) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const byName = useMemo(() => new Map(filtered.map((m) => [m.name, m])), [filtered]);
  const groups = useMemo(() => groupCadParts(filtered.map((m) => m.name)), [filtered]);
  const isMulti = (e: React.MouseEvent) => e.shiftKey || e.ctrlKey || e.metaKey;

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const partRow = (name: string, indent: string) => {
    const mesh = byName.get(name);
    if (!mesh) return null;
    return (
      <button
        key={name}
        onClick={(e) => onSelectMesh(name, isMulti(e))}
        onMouseEnter={() => onHoverPart?.(name)}
        onMouseLeave={() => onHoverPart?.(null)}
        className={`w-full text-left ${indent} pr-3 py-2.5 mb-1 cursor-pointer transition-all duration-200 border ${
          mesh.selected ? "text-foreground bg-accent border-border" : "hover:bg-accent/50 text-foreground/80 border-transparent"
        } ${!mesh.visible ? "opacity-35" : ""}`}
      >
        <div className="text-[11px] mb-0.5 truncate font-medium">
          {!mesh.visible && "[H] "}{mesh.name}
        </div>
        <div className="font-mono text-[9px] text-muted-foreground">
          {mesh.verts} verts / {mesh.faces} faces
        </div>
      </button>
    );
  };

  const renderGroup = (kind: "stone" | "metal", heading: string) => {
    const families = groups.filter((g) => g.kind === kind);
    if (families.length === 0) return null;
    return (
      <div key={kind}>
        <div className="px-3 pt-2 pb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{heading}</div>
        {families.map((fam) => {
          if (!onSelectFamily) return fam.names.map((n) => partRow(n, "pl-3"));
          if (fam.names.length === 1) return partRow(fam.names[0], "pl-3");
          const selectedCount = fam.names.filter((n) => byName.get(n)?.selected).length;
          const state = selectedCount === 0 ? "false" : selectedCount === fam.names.length ? "true" : "mixed";
          const allHidden = fam.names.every((n) => !byName.get(n)?.visible);
          const isOpen = expanded.has(fam.key);
          return (
            <div key={fam.key}>
              <div className="flex items-stretch gap-1 mb-1">
                <button
                  onClick={(e) => onSelectFamily(fam.names[0], isMulti(e))}
                  onMouseEnter={() => onHoverPart?.(fam.names[0])}
                  onMouseLeave={() => onHoverPart?.(null)}
                  aria-pressed={state}
                  className={`flex-1 min-w-0 text-left px-3 py-2.5 transition-all duration-200 border ${
                    state === "true" ? "text-foreground bg-accent border-border"
                      : state === "mixed" ? "text-foreground bg-accent/50 border-border"
                      : "hover:bg-accent/50 text-foreground/80 border-transparent"
                  } ${allHidden ? "opacity-35" : ""}`}
                >
                  <div className="text-[11px] mb-0.5 truncate font-medium">
                    {allHidden && "[H] "}{fam.label} <span className="font-mono text-muted-foreground">· {fam.names.length}</span>
                  </div>
                  <div className="font-mono text-[9px] text-muted-foreground">
                    {selectedCount > 0 ? `${selectedCount} selected` : "Click to select all"}
                  </div>
                </button>
                <button
                  onClick={() => toggle(fam.key)}
                  aria-expanded={isOpen}
                  aria-label={`Show parts in ${fam.label}`}
                  className="flex items-center justify-center px-2 border border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors duration-150"
                >
                  <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`} />
                </button>
              </div>
              {isOpen && fam.names.map((n) => partRow(n, "pl-6"))}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 pt-3 pb-2 flex-shrink-0">
        <input
          type="text"
          placeholder="Search parts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 text-[11px] text-foreground placeholder:text-muted-foreground/50 transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-ring font-body bg-muted/30 border border-border"
        />
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-1 scrollbar-thin">
        {filtered.length === 0 && (
          <div className="text-center font-mono text-[10px] text-muted-foreground/50 py-5">
            {meshes.length === 0 ? "Generate a piece to see its parts" : "No matching parts"}
          </div>
        )}
        {renderGroup("stone", "Stones")}
        {renderGroup("metal", "Metal")}
      </div>
    </div>
  );
}
