import { ArrowUpRight, Eraser, MousePointer2, Paintbrush, Square } from "lucide-react";
import type { MarkupTool } from "./MarkupCanvas";

/** The markup tools, their one-key shortcuts and the line shown under each name. */
export const MARKUP_TOOLS: { id: MarkupTool; name: string; hint: string; key: string; Icon: typeof Paintbrush }[] = [
  { id: "select", name: "Select", hint: "Move, resize or delete a mark", key: "V", Icon: MousePointer2 },
  { id: "brush", name: "Brush", hint: "Paint over areas", key: "B", Icon: Paintbrush },
  { id: "box", name: "Rectangle", hint: "Draw a box around an area", key: "R", Icon: Square },
  { id: "arrow", name: "Arrow", hint: "Point to a specific area", key: "A", Icon: ArrowUpRight },
  { id: "erase", name: "Erase", hint: "Rub out part of a mark", key: "E", Icon: Eraser },
];
