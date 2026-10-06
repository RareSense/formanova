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

/** The angles a CAD designer checks for each piece; the first three start ticked. */
export const ANGLE_SUGGESTIONS: Record<CadJewelryType, AngleSuggestion[]> = {
  ring: [
    { view: "Top", shows: "Looking straight down" },
    { view: "Side", shows: "The band's profile" },
    { view: "Back", shows: "The back of the head" },
    { view: "Underside", shows: "Inside the shank" },
  ],
  earring: [
    { view: "Side", shows: "The profile" },
    { view: "Back", shows: "The back and the post" },
    { view: "Three-quarter", shows: "Depth and setting" },
    { view: "Front", shows: "Straight on" },
  ],
  necklace: [
    { view: "Back", shows: "The back of the pendant" },
    { view: "Side", shows: "Thickness and bail" },
    { view: "Bail close-up", shows: "Where the chain goes" },
    { view: "Front", shows: "Straight on" },
  ],
  bracelet: [
    { view: "Top", shows: "Looking straight down" },
    { view: "Side", shows: "The profile" },
    { view: "Clasp close-up", shows: "How it closes" },
    { view: "Inside", shows: "The inner surface" },
  ],
  other: [
    { view: "Top", shows: "Looking straight down" },
    { view: "Side", shows: "The profile" },
    { view: "Back", shows: "The back" },
    { view: "Three-quarter", shows: "Depth and setting" },
  ],
};

export const MAX_ANGLES = 4;
export const DEFAULT_TICKED = 3;
