/** Prompts come back from the backend with raw markdown emphasis (e.g.
 * `**spider-shaped**`) meant for a chat surface, not a card: strip it so the
 * literal asterisks don't render. */
export function stripMarkdownEmphasis(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/(?<!\*)\*(?!\*)(.*?)\*(?!\*)/g, "$1");
}

/** About two lines on a library card. */
const PREVIEW_CHARS = 90;

/**
 * A one-glance preview of a prompt for hover: one line of text, cut at a word
 * boundary and ended with "…" when longer than `max`. The full prompt is only
 * ever shown in the prompt box, once the card is chosen.
 */
export function previewPrompt(text: string, max = PREVIEW_CHARS): string {
  const flat = stripMarkdownEmphasis(text).replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  let cut = flat.slice(0, max);
  const space = cut.lastIndexOf(" ");
  // A word boundary near the end; one enormous word is cut where it is.
  if (space > max * 0.6) cut = cut.slice(0, space);
  return `${cut.replace(/[\s,;:.\-–—]+$/, "")}…`;
}
