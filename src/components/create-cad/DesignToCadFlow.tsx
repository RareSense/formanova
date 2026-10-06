import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useDesignImageRun } from "@/hooks/useDesignImageRun";
import { CAD_EXAMPLE_DESIGNS } from "@/components/text-to-cad/cad-examples";
import { blobToDataUrl } from "@/lib/design-image-run";
import { cadJewelryNoun, type CadJewelryType } from "@/lib/ring-cad-nurbs-api";
import type { DesignImageStartParams } from "@/lib/design-image-api";
import DesignStartScreen, { type DesignBrief } from "./DesignStartScreen";
import DesignPickScreen, { type PickSlot } from "./DesignPickScreen";
import DesignEditor from "./DesignEditor";
import { fileFromUrl, toObjectUrl } from "./picture-urls";

interface DesignToCadFlowProps {
  jewelryType: CadJewelryType | null;
  setJewelryType: (t: CadJewelryType) => void;
  onGlbUpload?: (file: File) => void;
  /** Dimensions for the CAD (the page's prompt). */
  dimensions: string;
  onDimensions: (text: string) => void;
  cadCost: number | null;
  cadCostLoading: boolean;
  /** Admin-only model choice, shown beside Generate CAD. */
  modelPicker?: ReactNode;
  creatingCad: boolean;
  /** Generate CAD from the approved pictures (main first). */
  onCreateCad: (files: File[]) => void;
}

/** What the toolkit is asked for, from the customer's brief. */
async function requestFor(brief: DesignBrief, jewelryType: CadJewelryType | null): Promise<DesignImageStartParams> {
  const noun = jewelryType ? cadJewelryNoun(jewelryType) : "piece";
  const images = await Promise.all(brief.images.map(async (f) => ({ role: "reference" as const, image: await blobToDataUrl(f) })));
  // The toolkit needs words when no design is being edited; Draw and Mix may have none.
  const fallback = brief.mode === "draw"
    ? `Turn this drawing into a realistic ${noun} design.`
    : brief.mode === "mix" ? `Combine these pictures into one ${noun} design.` : "";
  return { prompt: brief.text || fallback, images, jewelryType };
}

/**
 * Text to CAD as design first: start (describe, draw or mix), the designs to
 * pick from, then the same editor as Image to CAD (edit, angles, Ready for
 * CAD). Generate CAD hands the approved pictures to the page's normal CAD run.
 */
export default function DesignToCadFlow({ jewelryType, setJewelryType, onGlbUpload, dimensions, onDimensions, cadCost, cadCostLoading, creatingCad, onCreateCad, modelPicker }: DesignToCadFlowProps) {
  const { generate } = useDesignImageRun();
  const [stage, setStage] = useState<"start" | "pick">("start");
  const [brief, setBrief] = useState<DesignBrief | null>(null);
  const [slots, setSlots] = useState<PickSlot[]>([]);
  const [editorSource, setEditorSource] = useState<File | null>(null);
  const objectUrls = useRef<string[]>([]);

  useEffect(() => () => { objectUrls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  const make = useCallback(async (next: DesignBrief) => {
    setBrief(next);
    setStage("pick");
    setSlots(Array.from({ length: next.count }, () => ({ status: "making" as const })));
    const request = await requestFor(next, jewelryType);
    const examples = CAD_EXAMPLE_DESIGNS[jewelryType ?? "ring"];
    const outcomes = await generate(Array.from({ length: next.count }, () => request), {
      // Preview mode only: describe-only briefs have no picture of their own to show.
      previewFallbacks: next.images.length ? undefined : Array.from({ length: next.count }, (_, i) => examples[i % examples.length]?.image ?? null),
      onOutcome: (i, outcome) => {
        if (!("result" in outcome)) {
          setSlots((s) => s.map((x, k) => (k === i ? { status: "failed", message: "message" in outcome ? outcome.message : undefined } : x)));
          return;
        }
        void toObjectUrl(outcome.result.image.url).then(
          (display) => {
            objectUrls.current.push(display);
            setSlots((s) => s.map((x, k) => (k === i ? { status: "ready", display } : x)));
            // Just 1: straight into the editor.
            if (next.count === 1) void fileFromUrl(display, "design.png").then(setEditorSource);
          },
          () => setSlots((s) => s.map((x, k) => (k === i ? { status: "failed", message: "Couldn't load this design." } : x))),
        );
      },
    });
    if (outcomes === null) { setStage("start"); setSlots([]); }
  }, [generate, jewelryType]);

  const pick = (i: number) => {
    const display = slots[i]?.display;
    if (display) void fileFromUrl(display, `design-${i + 1}.png`).then(setEditorSource);
  };

  return (
    <>
      {/* Kept mounted while hidden, so Back finds the brief as it was left. */}
      <div className={stage === "start" ? "contents" : "hidden"}>
        <DesignStartScreen jewelryType={jewelryType} setJewelryType={setJewelryType} busy={false} onMake={(b) => void make(b)} onGlbUpload={onGlbUpload} />
      </div>
      {stage === "pick" && (
        <DesignPickScreen
          slots={slots}
          onPick={pick}
          onMakeMore={() => { if (brief) void make({ ...brief, count: 4 }); }}
          onBack={() => setStage("start")}
        />
      )}
      <DesignEditor
        open={!!editorSource}
        source={editorSource}
        jewelryType={jewelryType}
        // Closing, before or after approving, returns to the designs to pick from.
        onCancel={() => setEditorSource(null)}
        onKeep={() => setEditorSource(null)}
        onCreateCad={(files) => onCreateCad(files)}
        dimensions={dimensions}
        onDimensions={onDimensions}
        cadCost={cadCost}
        cadCostLoading={cadCostLoading}
        creatingCad={creatingCad}
        modelPicker={modelPicker}
      />
    </>
  );
}
