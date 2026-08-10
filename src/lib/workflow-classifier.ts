export type SourceType = "photo" | "product_shot" | "cad_render" | "cad_text" | "cad_sketch" | "unknown";

export interface WorkflowTypeMeta {
  sourceType: SourceType;
  label: string;
  historyTitle?: string;
  historySubtitle?: string;
  loadRoute?: string;
}

interface WorkflowRule extends WorkflowTypeMeta {
  priority: number;
  matches: (normalizedName: string) => boolean;
}

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

const WORKFLOW_RULES: WorkflowRule[] = [
  {
    sourceType: "cad_sketch",
    label: "Image to 3D",
    historyTitle: "Image to 3D",
    historySubtitle: "AI-generated 3D models from reference images",
    loadRoute: "/image-to-cad",
    priority: 100,
    matches: (name) =>
      // ring_cad_nurbs_v1 names neither "sketch" nor "image", and contains
      // "cad", so without this it would fall through to the CAD Render rule.
      includesAny(name, ["ring_cad_nurbs", "ring-cad-nurbs"]) ||
      includesAny(name, ["sketch_generate", "sketch-generate"]) ||
      (includesAny(name, ["sketch", "image"]) && includesAny(name, ["cad", "ring"])),
  },
  {
    sourceType: "cad_text",
    label: "Text to 3D",
    historyTitle: "Text to 3D",
    historySubtitle: "AI-generated 3D models from text",
    loadRoute: "/text-to-cad",
    priority: 90,
    matches: (name) =>
      includesAny(name, ["ring_full_pipeline", "ring_generate", "text_to_cad", "text-to-cad", "ring-generate"]) ||
      (name.includes("ring") && includesAny(name, ["pipeline", "generate"])) ||
      (name.includes("text") && name.includes("cad")),
  },
  {
    sourceType: "product_shot",
    label: "Product Shot",
    historyTitle: "Product Shot",
    historySubtitle: "AI-generated product photography",
    priority: 80,
    matches: (name) => includesAny(name, ["product_shot", "product-shot"]),
  },
  {
    sourceType: "cad_render",
    label: "CAD Render",
    historyTitle: "CAD Render",
    historySubtitle: "Rendered previews from CAD outputs",
    priority: 70,
    matches: (name) => includesAny(name, ["cad", "render"]),
  },
  {
    sourceType: "photo",
    label: "Model Shot",
    historyTitle: "Model Shot",
    historySubtitle: "Jewelry photo to on-model imagery",
    priority: 60,
    matches: (name) =>
      includesAny(name, [
        "photo",
        "masking",
        "flux",
        "necklace",
        "earring",
        "bracelet",
        "watch",
        "jewelry",
        "agentic",
      ]),
  },
];

const UNKNOWN_META: WorkflowTypeMeta = {
  sourceType: "unknown",
  label: "Unknown",
};

export function inferSourceType(name: string): SourceType {
  return classifyWorkflow(name).sourceType;
}

export function classifyWorkflow(name: string): WorkflowTypeMeta {
  const normalized = name.toLowerCase();
  const match = WORKFLOW_RULES
    .filter((rule) => rule.matches(normalized))
    .sort((a, b) => b.priority - a.priority)[0];

  return match ?? UNKNOWN_META;
}

export function getWorkflowTypeMeta(sourceType: SourceType): WorkflowTypeMeta {
  return WORKFLOW_RULES.find((rule) => rule.sourceType === sourceType) ?? UNKNOWN_META;
}
