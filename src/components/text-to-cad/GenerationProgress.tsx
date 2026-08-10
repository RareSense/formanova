import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Diamond } from "lucide-react";

const NODE_LABELS: Record<string, string> = {
  generate_initial: "Generating design",
  generate_from_sketch: "Analyzing your design",
  build_initial: "Rendering preview",
  generate_fix: "Fixing mesh",
  build_retry: "Refining mesh",
  validate_output: "Validating output",
  validate_against_sketch: "Validating against image",
  build_corrected: "Rendering final",
  success_final: "Generation complete",
  success_original_glb: "Your 3D design is ready",
  failed_final: "Could not complete generation",
  _loading: "Loading model into viewport",
  // ring_cad_nurbs_v1 reports progress through node_visit_seq rather than named
  // nodes, so these three stand in for the phases the page distinguishes.
  analyzing: "Analyzing your design",
  building: "Building your 3D ring",
  repairing: "Fixing the model",
};

const TERMINAL_NODES = new Set(["success_final", "success_original_glb", "failed_final"]);

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface GenerationProgressProps {
  visible: boolean;
  currentStep: string;
  retryAttempt?: number;
  maxAttempts?: number;
  onRetry?: () => void;
  /** Replaces the default wait estimate. Runs vary a lot by workflow. */
  estimateText?: string;
  /** Backend-authored failure copy, shown instead of the generic message. */
  failureMessage?: string | null;
}

export default function GenerationProgress({
  visible,
  currentStep,
  retryAttempt,
  maxAttempts = 3,
  onRetry,
  estimateText,
  failureMessage,
}: GenerationProgressProps) {
  const [elapsed, setElapsed] = useState(0);
  const workflowStartRef = useRef(Date.now());

  useEffect(() => {
    if (visible) {
      workflowStartRef.current = Date.now();
      setElapsed(0);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || TERMINAL_NODES.has(currentStep)) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - workflowStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [visible, currentStep]);

  if (!visible) return null;

  const isFailed = currentStep === "failed_final";
  const isDone = currentStep === "success_final" || currentStep === "success_original_glb";
  const isTerminal = isFailed || isDone;

  const label = NODE_LABELS[currentStep] || "";

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-background backdrop-blur-sm">
      <div className="flex flex-col items-center gap-6 w-full max-w-sm mx-auto">
        {/* Diamond spinner — same as photo studio */}
        {!isTerminal && (
          <div className="relative mb-2">
            <div className="w-24 h-24 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            <Diamond className="absolute inset-0 m-auto h-10 w-10 text-primary" />
          </div>
        )}

        {/* Label + timer */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col items-center gap-2 text-center"
          >
            <span
              className={`font-display text-lg tracking-[0.12em] uppercase text-center ${
                isFailed ? "text-destructive" : "text-foreground/80"
              }`}
            >
              {label}
            </span>
            {!isTerminal && currentStep !== "_loading" && (
              <>
                <span className="font-mono text-sm text-muted-foreground/50 tabular-nums text-center">
                  {formatElapsed(elapsed)}
                </span>
                <span className="text-[11px] italic text-muted-foreground/40 text-center">
                  {estimateText ?? "This may take more than 10 minutes"}
                </span>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {isFailed && (
          <div className="flex flex-col items-center gap-4 mt-2">
            <p className="text-[11px] text-muted-foreground/70 max-w-xs text-center leading-relaxed">
              {failureMessage ?? "Our AI service was unable to complete this generation. Please try again in a few minutes."}
            </p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="px-8 py-3 text-[12px] font-bold uppercase tracking-[0.2em] bg-primary text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer"
              >
                Try Again
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
