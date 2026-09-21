/**
 * Metal-or-gem classification of CAD part names.
 *
 * The CAD pipeline composes names from several words (`halo_shared_bead_3_inner`,
 * `shoulderaccent.l`, `shank_and_pave_shoulders`). Like an English compound, the
 * last meaningful word decides what the part is: a `halo … bead` is the metal
 * bead holding a halo stone, while a `gallery … accent` is a stone. So every
 * known word is located in the name and the one that ends last wins.
 *
 * Returns null when the name contains no known word, so callers can keep their
 * own material/shape fallbacks for unnamed meshes.
 */
export type CadPartKind = "gem" | "metal";

/** Stone words, including cut names and gem species. */
const GEM_WORDS = [
  "gem", "diamond", "stone", "accent", "pave", "melee", "brilliant", "brill", "crystal", "jewel",
  "solitaire", "cz", "cubic", "moissanite", "briolette", "cabochon", "facet", "round_cut",
  "cushion", "oval", "marquise", "princess", "baguette", "asscher", "trillion", "pear",
  "ruby", "sapphire", "emerald", "amethyst", "citrine", "aquamarine", "topaz", "garnet",
  "peridot", "tanzanite", "morganite", "onyx", "opal", "pearl",
];

/** Metal words: parts that hold stones, and the body of the piece. */
const METAL_WORDS = [
  "bead", "seat", "cup", "prong", "claw", "collet", "bezel", "basket", "setting", "milgrain",
  "strut", "rail", "rim", "wall", "mount", "plateau", "gallery", "shank", "band", "bridge",
  "shoulder", "frame", "metal", "gold", "silver", "platinum", "rhodium",
];

// "engagement" contains "gem"; it describes a ring style, never a stone.
const NEUTRAL_WORDS = /engagement/g;

export function classifyCadPartName(name: string): CadPartKind | null {
  const lower = (name || "").toLowerCase().replace(NEUTRAL_WORDS, " ");
  let best: { end: number; length: number; kind: CadPartKind } | null = null;
  const consider = (words: string[], kind: CadPartKind) => {
    for (const word of words) {
      const at = lower.lastIndexOf(word);
      if (at < 0) continue;
      const end = at + word.length;
      if (!best || end > best.end || (end === best.end && word.length > best.length)) {
        best = { end, length: word.length, kind };
      }
    }
  };
  consider(GEM_WORDS, "gem");
  consider(METAL_WORDS, "metal");
  return best ? best.kind : null;
}

export function isCadGemName(name: string): boolean {
  return classifyCadPartName(name) === "gem";
}
