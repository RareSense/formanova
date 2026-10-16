import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gem } from "lucide-react";

const LATER_MSGS = ["Sketching the design...", "Setting the stones...", "Rendering your design...", "Almost there..."];

interface DesignGeneratingProps {
  /** The first message names what is being read: description, drawing or inspiration. */
  firstMessage: string;
  /** The customer's input pictures, shown faded below, as in Photo Studio. */
  inputs: string[];
}

/** The wait for a new design: the same screen as On Model and Product Shot generation (StudioGeneratingStep). */
export default function DesignGenerating({ firstMessage, inputs }: DesignGeneratingProps) {
  const msgs = [firstMessage, ...LATER_MSGS];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setIdx((i) => Math.min(i + 1, msgs.length - 1)), 5000);
    return () => window.clearInterval(t);
  }, [msgs.length]);

  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="flex min-h-[70vh] w-full items-center justify-center bg-background px-4">
      <div role="status" aria-live="polite" className="flex w-full max-w-md flex-col items-center border border-dashed border-border/40 px-16 py-14">
        <div className="relative mb-8" aria-hidden="true">
          <div className="h-24 w-24 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
          <Gem className="absolute inset-0 m-auto h-10 w-10 text-primary" />
        </div>
        <h2 className="mb-3 font-display text-3xl uppercase tracking-tight">Generating</h2>
        <AnimatePresence mode="wait">
          <motion.p key={msgs[idx]} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.4 }}
            className="mb-6 text-center font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            {msgs[idx]}
          </motion.p>
        </AnimatePresence>
        <p className="mb-8 font-mono text-[10px] italic text-muted-foreground">This can take up to 90 seconds</p>
        {inputs.length > 0 && (
          <div className="flex flex-wrap justify-center gap-3">
            {inputs.map((src, i) => (
              <div key={src} className="h-16 w-16 overflow-hidden border border-border/30">
                <img src={src} alt={inputs.length > 1 ? `Your picture ${i + 1}` : "Your picture"} className="h-full w-full object-cover opacity-50" />
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
