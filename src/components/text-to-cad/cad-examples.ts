import type { CadJewelryType } from '@/lib/ring-cad-nurbs-api';

import cadExample1 from '@/assets/examples/cad-example-1.webp';
import cadExample2 from '@/assets/examples/cad-example-2.webp';
import cadExample3 from '@/assets/examples/cad-example-3.webp';
import cadExample4 from '@/assets/examples/cad-example-4.webp';

import necklaceExample1 from '@/assets/examples/cad-examples/necklace-1.webp';
import necklaceExample2 from '@/assets/examples/cad-examples/necklace-2.webp';
import necklaceExample3 from '@/assets/examples/cad-examples/necklace-3.webp';
import necklaceExample4 from '@/assets/examples/cad-examples/necklace-4.webp';
import braceletExample1 from '@/assets/examples/cad-examples/bracelet-1.webp';
import braceletExample2 from '@/assets/examples/cad-examples/bracelet-2.webp';
import braceletExample3 from '@/assets/examples/cad-examples/bracelet-3.webp';
import braceletExample4 from '@/assets/examples/cad-examples/bracelet-4.webp';
import earringExample1 from '@/assets/examples/cad-examples/earring-1.webp';
import earringExample2 from '@/assets/examples/cad-examples/earring-2.webp';
import earringExample3 from '@/assets/examples/cad-examples/earring-3.webp';
import earringExample4 from '@/assets/examples/cad-examples/earring-4.webp';
import otherExample1 from '@/assets/examples/cad-examples/other-1.webp';
import otherExample2 from '@/assets/examples/cad-examples/other-2.webp';
import otherExample3 from '@/assets/examples/cad-examples/other-3.webp';
import otherExample4 from '@/assets/examples/cad-examples/other-4.webp';

/**
 * Examples for the CAD prompt screens, per piece. Image to CAD shows the
 * designs (a picture plus the description it loads); Text to CAD shows the
 * written briefs. Kept deliberately simple so a first try builds well.
 */
export interface CadExampleDesign {
  image: string;
  prompt: string;
}

export const CAD_EXAMPLE_DESIGNS: Record<CadJewelryType, CadExampleDesign[]> = {
  ring: [
    { image: cadExample1, prompt: "Oval center stone with ball-tip prong setting, flanked by marquise side stones and small round accent clusters, tapered rounded band" },
    { image: cadExample2, prompt: "Asymmetric botanical ring with two large leaf forms rising from a split flowing band, small round center stone nestled between the leaves, accent stones along leaf edges" },
    { image: cadExample3, prompt: "Large oval center stone in four-prong setting surrounded by round halo, split shank band with accent stones running along each shank" },
    { image: cadExample4, prompt: "Wide dome cluster ring, oval center stone surrounded by six oval accents, filigree openwork shoulders" },
  ],
  necklace: [
    { image: necklaceExample1, prompt: "Flame-shaped pendant of curling ribbons lined with small pavé stones, a round cluster at the centre, on a fine chain" },
    { image: necklaceExample2, prompt: "Oval sapphire in a four-prong setting with a halo of round and marquise diamonds, on a cable chain" },
    { image: necklaceExample3, prompt: "Sculpted gold leaf pendant with open curved ribs and a plain bail, on a cable chain" },
    { image: necklaceExample4, prompt: "Two interlocking hearts, one twisted cable and one set with pavé diamonds, on a cable chain" },
  ],
  bracelet: [
    { image: braceletExample1, prompt: "Open cuff bracelet engraved with stars and dots" },
    { image: braceletExample2, prompt: "Polished gold hinged bangle with one emerald-cut stone set flush at the top" },
    { image: braceletExample3, prompt: "Rose gold wrap bangle shaped like a snake, with tapered overlapping scales and a pointed head" },
    { image: braceletExample4, prompt: "Oval link chain bracelet, alternating plain gold links and twisted silver cable links, with a push clasp" },
  ],
  earring: [
    { image: earringExample1, prompt: "Chandelier earrings on French hooks with three long faceted drops" },
    { image: earringExample2, prompt: "Cross-shaped stud earrings, one polished twisted bar crossing one bar set with pavé diamonds" },
    { image: earringExample3, prompt: "Double hoop earrings, one gold and one twisted silver, with a cushion-cut green stone drop in a gold bezel" },
    { image: earringExample4, prompt: "Dragonfly hoop earrings: marquise wings in pink and violet, a pearl, round stones along the body and hoop, and a blue pear stone" },
  ],
  other: [
    { image: otherExample1, prompt: "Spider brooch with a green pavé body and eight thin jointed legs set with small stones" },
    { image: otherExample2, prompt: "Rectangular cufflinks with a black onyx inlay, a beaded gold border and a small stone panel at the centre" },
    { image: otherExample3, prompt: "Thin gold headband tiara with a butterfly centrepiece of pear-shaped stones and a pavé outline" },
    { image: otherExample4, prompt: "Ladies' watch with a round pavé bezel, a white dial with stone hour markers, and an open double-bar bangle strap set with stones" },
  ],
};

export const CAD_EXAMPLE_PROMPTS: Record<CadJewelryType, string[]> = {
  ring: [
    "Serpentine ring with a coiled snake design",
    "Sculptural flowing gold band",
    "Botanical ring with leaves wrapping around the band",
    "Gothic ring with sharp arches and dark gemstones",
    "Twisted vine ring with small diamonds",
    "Minimalist ring with a single oval diamond",
  ],
  necklace: [
    "Solitaire pendant with a round diamond in a four-prong setting on a cable chain",
    "Polished gold heart pendant with a simple bail",
    "Oval sapphire pendant with a diamond halo",
    "Vertical bar pendant with one bezel-set stone",
    "Two interlocking hearts, one plain and one set with small diamonds",
    "Sculpted gold leaf pendant with open curved ribs",
  ],
  bracelet: [
    "Tennis bracelet with round diamonds in four-prong settings",
    "Polished gold bangle with one emerald-cut stone at the top",
    "Open cuff bracelet engraved with small stars",
    "Paperclip link chain bracelet with a lobster clasp",
    "Snake wrap bangle with tapered scales",
    "Plain hinged bangle with a hidden box clasp",
  ],
  earring: [
    "Round diamond stud earrings in a four-prong basket setting",
    "Small polished gold hoop earrings",
    "Huggie hoops with a row of small round stones",
    "Drop earrings with one oval stone below a small round stud",
    "Cross-shaped studs, one bar polished and one set with pavé",
    "Chandelier earrings with three long faceted drops on French hooks",
  ],
  other: [
    "Spider brooch with a green pavé body and thin legs",
    "Rectangular cufflinks with a black onyx inlay and a gold border",
    "Headband tiara with a butterfly centrepiece set with small stones",
    "Leaf brooch with a single pearl and a pin back",
    "Round signet-style cufflinks with a polished top",
    "Ladies' watch case with a pavé bezel and a slim bangle strap",
  ],
};
