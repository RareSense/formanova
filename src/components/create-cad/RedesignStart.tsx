import { useState } from "react";
import type { CadJewelryType } from "@/lib/ring-cad-nurbs-api";
import CadJewelryTypeCards from "@/components/text-to-cad/CadJewelryTypeCards";
import DesignEditor from "./DesignEditor";

export default function RedesignStart() {
  const [type, setType] = useState<CadJewelryType | null>(null);
  const [picture, setPicture] = useState<File | null>(null);
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="font-display text-4xl">Redesign Jewellery</h1>
      <p className="mb-6 mt-2">Choose your piece and upload its photo. Mark or describe the changes you want.</p>
      <CadJewelryTypeCards value={type} onChange={setType} />
      <label className="mt-8 block font-medium">Upload a jewellery photo
        <input type="file" accept="image/*" disabled={!type} className="mt-2 block"
          onChange={event => {
            setPicture(event.target.files?.[0] ?? null);
            event.target.value = "";
          }} />
      </label>
      <DesignEditor designOnly open={!!picture} source={picture} jewelryType={type}
        onCancel={() => setPicture(null)} onKeep={() => setPicture(null)}
        onCreateCad={async () => false} dimensions="" onDimensions={() => {}} cadCost={null}
        cadCostLoading={false} creatingCad={false} />
    </main>
  );
}
