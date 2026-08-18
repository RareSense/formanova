import { useState } from "react";
import GenerationProgress from "@/components/text-to-cad/GenerationProgress";

type DemoStep = "analyzing" | "_loading" | "failed_final";

const DEMO_EMAIL = "demo@formanova.ai";

export default function DevCadGeneration() {
  const [step, setStep] = useState<DemoStep>("analyzing");
  const [visible, setVisible] = useState(true);
  const [notificationEmail, setNotificationEmail] = useState(DEMO_EMAIL);

  const showStep = (nextStep: DemoStep) => {
    setStep(nextStep);
    setVisible(true);
  };

  return (
    <div className="relative min-h-screen bg-background">
      <div
        aria-label="CAD generation demo controls"
        className="fixed right-4 top-24 z-[120] flex max-w-[calc(100vw-2rem)] flex-wrap justify-end gap-2 border border-border bg-background/95 p-2 shadow-sm backdrop-blur"
      >
        <span className="flex h-9 items-center px-2 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Demo · no requests or credits
        </span>
        <button
          type="button"
          onClick={() => showStep("analyzing")}
          className="h-9 border border-foreground/35 bg-background px-3 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-foreground hover:bg-accent/60"
        >
          Generating
        </button>
        <button
          type="button"
          onClick={() => showStep("_loading")}
          className="h-9 border border-foreground/35 bg-background px-3 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-foreground hover:bg-accent/60"
        >
          Loading preview
        </button>
        <button
          type="button"
          onClick={() => showStep("failed_final")}
          className="h-9 border border-foreground/35 bg-background px-3 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-foreground hover:bg-accent/60"
        >
          Failure
        </button>
      </div>

      {!visible && (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="font-display text-2xl uppercase tracking-[0.08em] text-foreground">
            Demo generation continues in the background
          </p>
          <button
            type="button"
            onClick={() => setVisible(true)}
            className="h-11 border border-foreground/45 bg-background px-6 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-foreground hover:bg-accent/60"
          >
            Return to demo
          </button>
        </div>
      )}

      <GenerationProgress
        visible={visible}
        currentStep={step}
        notificationEmail={notificationEmail}
        onSaveNotificationEmail={async email => {
          setNotificationEmail(email);
          return true;
        }}
        onKeepCreating={() => setVisible(false)}
        onRetry={() => showStep("analyzing")}
        failureMessage="This is the demo failure state. No generation was submitted."
      />
    </div>
  );
}
