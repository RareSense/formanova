import { useRef, useState } from "react";
import { Diamond } from "lucide-react";
import type { CadJewelryType } from "@/lib/ring-cad-nurbs-api";
import CadJewelryTypeCards from "@/components/text-to-cad/CadJewelryTypeCards";
import DesignEditor from "./DesignEditor";

/** Redesign Jewellery: upload a piece, mark or describe the changes, preview and download the design. No CAD is made. */
export default function RedesignStart() {
  const [type, setType] = useState<CadJewelryType | null>(null);
  const [picture, setPicture] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const take = (file: File | undefined) => {
    if (type && file && file.type.startsWith("image/")) setPicture(file);
  };
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <span className="marta-label mb-1 block">Redesign Jewellery</span>
      <h1 className="font-display text-3xl uppercase tracking-tight text-foreground md:text-4xl">What are you redesigning?</h1>
      <p className="mb-6 mt-2 text-sm text-muted-foreground">Choose the piece, then upload its photo. Mark or describe the changes, preview the result and download the design.</p>
      <CadJewelryTypeCards value={type} onChange={setType} />
      <div
        role="button"
        tabIndex={type ? 0 : -1}
        aria-disabled={!type}
        aria-label="Upload a jewellery photo"
        onClick={() => type && input.current?.click()}
        onKeyDown={(e) => { if (type && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); input.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); if (type) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); take(e.dataTransfer.files?.[0]); }}
        className={`mt-8 flex min-h-[180px] flex-col items-center justify-center gap-3 border-2 border-dashed px-6 py-8 text-center transition-colors ${
          type ? `cursor-pointer ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary"}` : "border-border opacity-50"
        }`}
      >
        <Diamond className="h-9 w-9 text-primary" />
        <span className="text-base font-medium text-foreground">{type ? "Upload a jewellery photo" : "Choose the piece first"}</span>
        <span className="text-sm text-muted-foreground">Drop it here or click to browse</span>
        <input ref={input} type="file" accept="image/*" className="hidden"
          onChange={(e) => { take(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      <DesignEditor designOnly open={!!picture} source={picture} jewelryType={type}
        onCancel={() => setPicture(null)} onKeep={() => setPicture(null)}
        onCreateCad={async () => false} dimensions="" onDimensions={() => {}} cadCost={null}
        cadCostLoading={false} creatingCad={false} />
    </main>
  );
}
