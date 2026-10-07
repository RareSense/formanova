import type { CadJewelryType, ImageInput } from "@/lib/ring-cad-nurbs-api";

/** A picture in the editor: what to show, and what to send when it is the base for the next request. */
export interface EditorPicture {
  /** Renderable, same-origin URL (blob:). */
  display: string;
  /** A data: URL or the run's artifact; null until first needed (the uploaded file is encoded lazily). */
  input: ImageInput | null;
  label: string;
}

export interface AngleSuggestion {
  /** Sent to the toolkit as the free-text view, so named views get its precise camera wording. */
  view: string;
  /** What the angle shows, in a jeweller's words. */
  shows: string;
}

/**
 * The four views that show the most of each kind of piece, beyond the main
 * picture (usually the front, so it is not repeated). None start ticked: the
 * customer picks one, several or all, and pays per angle.
 */
export const ANGLE_SUGGESTIONS: Record<CadJewelryType, AngleSuggestion[]> = {
  ring: [
    { view: "Side", shows: "Band profile and setting height" },
    { view: "Top", shows: "Looking straight down at the head" },
    { view: "Three-quarter", shows: "Depth and how the head meets the band" },
    { view: "Underside", shows: "Gallery and inside of the shank" },
  ],
  earring: [
    { view: "Side", shows: "Profile and thickness" },
    { view: "Back", shows: "The post, hook or clip" },
    { view: "Three-quarter", shows: "Depth and stone settings" },
    { view: "Top", shows: "How it hangs from above" },
  ],
  necklace: [
    { view: "Side", shows: "Thickness and the bail" },
    { view: "Back", shows: "The back of the pendant" },
    { view: "Three-quarter", shows: "Depth and stone settings" },
    { view: "Bail close-up", shows: "Where the chain goes through" },
  ],
  bracelet: [
    { view: "Top", shows: "The pattern from above" },
    { view: "Side", shows: "Profile and thickness" },
    { view: "Three-quarter", shows: "Depth and links" },
    { view: "Clasp close-up", shows: "How it closes" },
  ],
  other: [
    { view: "Side", shows: "Profile and thickness" },
    { view: "Back", shows: "The back" },
    { view: "Top", shows: "Looking straight down" },
    { view: "Three-quarter", shows: "Depth and settings" },
  ],
};

/** Five pictures in total go to the CAD: the main design plus up to four angles. */
export const MAX_ANGLES = 4;
