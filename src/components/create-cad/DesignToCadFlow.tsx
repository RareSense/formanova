import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCredits } from "@/contexts/CreditsContext";
import { savePostPurchaseReturn } from "@/lib/post-purchase-return";
import { DESIGN_IMAGE_CREDITS } from "@/lib/design-image-api";
import { useDesignImageRun } from "@/hooks/useDesignImageRun";
import { blobToDataUrl } from "@/lib/design-image-run";
import { cadJewelryNoun, type CadJewelryType } from "@/lib/ring-cad-nurbs-api";
import type { DesignImageStartParams } from "@/lib/design-image-api";
import DesignStartScreen, { type DesignBrief, type DesignStartVariant } from "./DesignStartScreen";
import DesignPickScreen, { type PickSlot } from "./DesignPickScreen";
import DesignGenerating from "./DesignGenerating";
import DesignEditor from "./DesignEditor";
import { fileFromUrl, toObjectUrl } from "./picture-urls";
import CadFlowSteps, { cadFlowStepLabels } from "./CadFlowSteps";

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
  /** Generate CAD from the approved pictures (main first); may resolve false when the run did not start. */
  onCreateCad: (files: File[]) => Promise<boolean | void> | void;
  /** Idea (describe or draw) or Inspiration (pictures). */
  variant?: DesignStartVariant;
  /** How the current design was started, for the step bar shown after this flow hands over. */
  onStartMode?: (mode: DesignBrief["mode"]) => void;
}

/** What the toolkit is asked for, from the customer's brief. */
export async function requestFor(brief: DesignBrief, jewelryType: CadJewelryType | null): Promise<DesignImageStartParams> {
  const noun = jewelryType ? cadJewelryNoun(jewelryType) : "piece";
  // A drawing is the piece itself, built as drawn; Inspiration pictures are translated.
  const role = brief.mode === "draw" ? "drawing" as const : "reference" as const;
  const images = await Promise.all(brief.images.map(async (f) => ({ role, image: await blobToDataUrl(f) })));
  // The toolkit needs words when no design is being edited; Draw and Mix may have none.
  const fallback = brief.mode === "draw"
    ? `Turn this drawing into a realistic ${noun} design.`
    : brief.mode === "mix"
      ? brief.images.length > 1 ? `Combine these pictures into one ${noun} design.` : `Design a ${noun} inspired by this picture.`
      : "";
  // Inspiration in words only: a creative piece of the chosen kind.
  if (brief.mode === "mix" && images.length === 0) return { prompt: `Design a creative ${noun} inspired by: ${brief.text}`, images, jewelryType };
  return { prompt: brief.text || fallback, images, jewelryType };
}

/**
 * Credits left after a design, when that is no longer enough for a CAD; null
 * when the warning is not needed (enough left, or a figure is unknown). A
 * balance below the design's own price is left to the normal credit check,
 * which sends the customer to buy credits.
 */
export function lowCreditsAfterDesign(balance: number | null, designCost: number, cadCost: number | null): number | null {
  if (balance === null || cadCost === null || cadCost <= 0) return null;
  if (balance < designCost) return null;
  const left = balance - designCost;
  return left < cadCost ? left : null;
}

/**
 * Text to CAD as design first: start (describe, draw or mix), the designs to
 * pick from, then the same editor as Image to CAD (edit, angles, Ready for
 * CAD). Generate CAD hands the approved pictures to the page's normal CAD run.
 */
export default function DesignToCadFlow({ jewelryType, setJewelryType, onGlbUpload, dimensions, onDimensions, cadCost, cadCostLoading, creatingCad, onCreateCad, modelPicker, variant, onStartMode }: DesignToCadFlowProps) {
  const { generate } = useDesignImageRun();
  const { credits } = useCredits();
  const navigate = useNavigate();
  const location = useLocation();
  /** A design waiting on the low-credit question, and what would be left after it. */
  const [lowCredit, setLowCredit] = useState<{ brief: DesignBrief; left: number } | null>(null);
  const [stage, setStage] = useState<"start" | "pick">("start");
  const [brief, setBrief] = useState<DesignBrief | null>(null);
  const [slots, setSlots] = useState<PickSlot[]>([]);
  const [editorSource, setEditorSource] = useState<File | null>(null);
  const objectUrls = useRef<string[]>([]);

  useEffect(() => () => { objectUrls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  const make = useCallback(async (next: DesignBrief) => {
    setBrief(next);
    onStartMode?.(next.mode);
    setStage("pick");
    setSlots(Array.from({ length: next.count }, () => ({ status: "making" as const })));
    const request = await requestFor(next, jewelryType);
    const outcomes = await generate(Array.from({ length: next.count }, () => request), {
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
  }, [generate, jewelryType, onStartMode]);

  /** Every new design goes through here: warn first when it would leave too little for the CAD. */
  const requestMake = (next: DesignBrief) => {
    const left = lowCreditsAfterDesign(credits, DESIGN_IMAGE_CREDITS * next.count, cadCost);
    if (left !== null) { setLowCredit({ brief: next, left }); return; }
    void make(next);
  };
  const buyCredits = () => {
    savePostPurchaseReturn(`${location.pathname}${location.search}`);
    setLowCredit(null);
    navigate("/credits", { state: { requiredCredits: cadCost } });
  };

  // One design: the Photo Studio generating screen, then straight into the
  // editor (no "Use this one" step in between).
  const single = slots.length === 1;
  const waiting = single && (slots[0].status === "making" || (slots[0].status === "ready" && !editorSource));
  const [inputUrls, setInputUrls] = useState<string[]>([]);
  useEffect(() => {
    const urls = (brief?.images ?? []).map((f) => URL.createObjectURL(f));
    setInputUrls(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [brief]);

  const pick = (i: number) => {
    const display = slots[i]?.display;
    if (display) void fileFromUrl(display, `design-${i + 1}.png`).then(setEditorSource);
  };

  const stepLabels = cadFlowStepLabels(brief?.mode ?? (variant === "inspiration" ? "mix" : "describe"));

  return (
    <>
      {/* Kept mounted while hidden, so Back finds the brief as it was left. */}
      <div className={stage === "start" ? "contents" : "hidden"}>
        <DesignStartScreen jewelryType={jewelryType} setJewelryType={setJewelryType} busy={false} onMake={requestMake} onGlbUpload={onGlbUpload} variant={variant} />
      </div>
      {stage === "pick" && (
        <div className="flex w-full flex-col">
          <CadFlowSteps labels={stepLabels} current={1} className="px-4 pt-10" />
          {waiting && (
            <DesignGenerating
              firstMessage={brief?.mode === "draw" ? "Reading your drawing..." : brief?.mode === "mix" ? "Studying your inspiration..." : "Reading your description..."}
              inputs={inputUrls}
            />
          )}
          {!waiting && !(single && slots[0].status === "ready") && (
            <DesignPickScreen
              slots={slots}
              onPick={pick}
              onMakeMore={() => { if (brief) requestMake({ ...brief, count: 4 }); }}
              onBack={() => setStage("start")}
            />
          )}
        </div>
      )}
      <DesignEditor
        open={!!editorSource}
        source={editorSource}
        jewelryType={jewelryType}
        // Closing returns to the designs to pick from, or with one design, to the start with the brief kept.
        onCancel={() => { setEditorSource(null); if (single) { setStage("start"); setSlots([]); } }}
        onKeep={() => { setEditorSource(null); if (single) { setStage("start"); setSlots([]); } }}
        onCreateCad={onCreateCad}
        // A design made here is already a design: no edit needed before Create CAD.
        approveWithoutEdit
        steps={(editorStage) => <CadFlowSteps labels={stepLabels} current={editorStage === "edit" ? 1 : 2} />}
        dimensions={dimensions}
        onDimensions={onDimensions}
        cadCost={cadCost}
        cadCostLoading={cadCostLoading}
        creatingCad={creatingCad}
        modelPicker={modelPicker}
      />
      <AlertDialog open={!!lowCredit} onOpenChange={(open) => { if (!open) setLowCredit(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Low on credits</AlertDialogTitle>
            <AlertDialogDescription>
              After this design you'll have {lowCredit?.left} credits — not enough for a CAD ({cadCost}). Continue anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={buyCredits}>Buy credits</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const next = lowCredit?.brief; setLowCredit(null); if (next) void make(next); }}>Generate anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
