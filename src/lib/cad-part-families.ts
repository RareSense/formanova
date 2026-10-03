/**
 * Part families: the sets of CAD parts a jeweller treats as one thing — every
 * pavé stone, every prong. Hovering or clicking one part in the CAD workspace
 * acts on its whole family, so a 40-stone pavé is one click, not forty.
 *
 * A family is the part name without numbers and side words: `pave_L_01_gem`
 * and `pave_R_07_gem` are both "pave gem". Inner/outer are kept, because a
 * double halo's two rows are usually chosen separately.
 */
import { classifyCadPartName } from "@/lib/cad-part-classifier";

// Names with no known word count as metal, as in the classifier's fixture and the
// viewer's default look: an unnamed petal or swirl is cast metal, not a stone.
export type CadPartFamilyKind = "stone" | "metal";

export interface CadPartFamily {
  key: string;
  label: string;
  kind: CadPartFamilyKind;
  names: string[];
}

const DROPPED_TOKENS = new Set(["l", "r", "left", "right", "up", "dn", "mesh", "copy"]);
const KIND_ORDER: Record<CadPartFamilyKind, number> = { stone: 0, metal: 1 };

export function cadPartFamilyKey(name: string): string {
  const tokens = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((t) => t.length > 1 && !DROPPED_TOKENS.has(t));
  return tokens.length > 0 ? tokens.join(" ") : name.toLowerCase();
}

export function cadPartKind(name: string): CadPartFamilyKind {
  const kind = classifyCadPartName(name);
  return kind === "gem" ? "stone" : "metal";
}

export function groupCadParts(names: string[]): CadPartFamily[] {
  const byKey = new Map<string, CadPartFamily>();
  for (const name of names) {
    const key = cadPartFamilyKey(name);
    const family = byKey.get(key);
    if (family) family.names.push(name);
    else byKey.set(key, { key, label: key.charAt(0).toUpperCase() + key.slice(1), kind: cadPartKind(name), names: [name] });
  }
  return [...byKey.values()].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.names.length - a.names.length || a.label.localeCompare(b.label),
  );
}

export function cadFamilyMembers(name: string, allNames: string[]): string[] {
  const key = cadPartFamilyKey(name);
  return allNames.filter((n) => cadPartFamilyKey(n) === key);
}
