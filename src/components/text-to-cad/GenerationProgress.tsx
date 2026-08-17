import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Diamond } from "lucide-react";
import { isValidNotificationEmail } from "@/lib/notification-email-api";

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
  analyzing: "Analyzing your design",
  building: "Building your 3D ring",
  repairing: "Fixing the model",
};

interface GenerationProgressProps {
  visible: boolean;
  currentStep: string;
  onRetry?: () => void;
  estimateText?: string;
  failureMessage?: string | null;
  notificationEmail?: string | null;
  notificationEmailLoading?: boolean;
  notificationEmailSaving?: boolean;
  notificationEmailError?: string | null;
  onSaveNotificationEmail?: (email: string) => Promise<boolean>;
  onKeepCreating?: () => void;
}

export default function GenerationProgress({
  visible,
  currentStep,
  onRetry,
  estimateText = "Complex designs can take up to 1 hour",
  failureMessage,
  notificationEmail,
  notificationEmailLoading = false,
  notificationEmailSaving = false,
  notificationEmailError,
  onSaveNotificationEmail,
  onKeepCreating,
}: GenerationProgressProps) {
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState(notificationEmail ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditingEmail) setEmailDraft(notificationEmail ?? "");
  }, [isEditingEmail, notificationEmail]);

  if (!visible) return null;

  const isFailed = currentStep === "failed_final";
  const isDone = currentStep === "success_final" || currentStep === "success_original_glb";
  const isLoadingModel = currentStep === "_loading";
  const isTerminal = isFailed || isDone;
  const isActiveGeneration = !isTerminal && !isLoadingModel;
  const label = NODE_LABELS[currentStep] || "Preparing your design";
  const emailError = validationError ?? notificationEmailError;

  const beginEmailEdit = () => {
    setEmailDraft(notificationEmail ?? "");
    setValidationError(null);
    setIsEditingEmail(true);
  };

  const cancelEmailEdit = () => {
    setEmailDraft(notificationEmail ?? "");
    setValidationError(null);
    setIsEditingEmail(false);
  };

  const submitEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = emailDraft.trim();
    if (!isValidNotificationEmail(normalizedEmail)) {
      setValidationError("Enter a valid email address.");
      return;
    }
    setValidationError(null);
    if (await onSaveNotificationEmail?.(normalizedEmail)) setIsEditingEmail(false);
  };

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center overflow-auto bg-background px-5 py-8">
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="w-full max-w-[560px] px-2 py-5 text-center sm:px-8"
        aria-labelledby="cad-generation-heading"
      >
        <div
          role={isFailed ? "alert" : "status"}
          aria-live={isFailed ? "assertive" : "polite"}
          aria-atomic="true"
        >
          {!isTerminal && (
            <div className="relative mx-auto mb-5 h-14 w-14" aria-hidden="true">
              <div className="absolute inset-0 rounded-full border-2 border-foreground/15" />
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-transparent border-t-[hsl(var(--formanova-hero-accent))]"
                animate={{ rotate: 360 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
              />
              <Diamond className="absolute inset-0 m-auto h-5 w-5 text-foreground" strokeWidth={1.8} />
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
            >
              {isActiveGeneration && (
                <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--formanova-hero-accent))]">
                  Generation in progress
                </p>
              )}
              <h1
                id="cad-generation-heading"
                className={`font-display text-[26px] uppercase tracking-[0.08em] sm:text-[30px] ${
                  isFailed ? "text-destructive" : "text-foreground"
                }`}
              >
                {isActiveGeneration ? "Your CAD is generating" : label}
              </h1>

              {isActiveGeneration && (
                <>
                  <p className="mt-3 text-sm font-semibold leading-6 text-foreground sm:text-[15px]">
                    {estimateText}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    You can safely leave this page. Your generation will continue in the background.
                  </p>
                </>
              )}

              {isLoadingModel && (
                <p className="mx-auto mt-3 max-w-sm text-xs leading-5 text-muted-foreground">
                  Your CAD is ready. We’re preparing the interactive preview.
                </p>
              )}

              {isFailed && (
                <p className="mx-auto mt-4 max-w-sm text-xs leading-relaxed text-muted-foreground">
                  {failureMessage ?? "Our AI service was unable to complete this generation. Please try again in a few minutes."}
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {isActiveGeneration && (
          <div className="mt-5">
            {!isEditingEmail ? (
              <div className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1 text-xs leading-5 text-muted-foreground">
                <span>
                  We’ll email the 3DM download links to{" "}
                  <strong className="break-all font-semibold text-foreground">
                    {notificationEmailLoading && !notificationEmail ? "your account email" : notificationEmail ?? "your account email"}
                  </strong>{" "}
                  when ready.
                </span>
                {onSaveNotificationEmail && (
                  <button
                    type="button"
                    onClick={beginEmailEdit}
                    className="border-b border-[hsl(var(--formanova-hero-accent))]/70 bg-transparent text-[11px] font-medium text-[hsl(var(--formanova-hero-accent))] transition-colors hover:border-[hsl(var(--formanova-hero-accent))] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Use a different email
                  </button>
                )}
              </div>
            ) : (
              <form className="mx-auto max-w-[470px] text-left" onSubmit={submitEmail} noValidate>
                <label htmlFor="cad-notification-email" className="text-xs font-semibold text-foreground">
                  Notification email
                </label>
                <input
                  id="cad-notification-email"
                  type="email"
                  autoComplete="email"
                  value={emailDraft}
                  onChange={event => {
                    setEmailDraft(event.target.value);
                    setValidationError(null);
                  }}
                  aria-invalid={Boolean(emailError)}
                  aria-describedby={emailError ? "cad-notification-email-error" : undefined}
                  disabled={notificationEmailSaving}
                  className="mt-2 h-11 w-full border border-foreground/35 bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-[hsl(var(--formanova-hero-accent))] focus:ring-1 focus:ring-[hsl(var(--formanova-hero-accent))] disabled:opacity-60"
                />
                {emailError && (
                  <p id="cad-notification-email-error" role="alert" className="mt-2 text-xs text-destructive">
                    {emailError}
                  </p>
                )}
                <div className="mt-3 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={cancelEmailEdit}
                    disabled={notificationEmailSaving}
                    className="h-9 px-4 text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={notificationEmailSaving}
                    className="h-9 border border-foreground/45 bg-background px-5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-accent/60 disabled:opacity-60"
                  >
                    {notificationEmailSaving ? "Saving…" : "Save"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {isFailed && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-5 h-11 border border-destructive/60 bg-background px-7 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Try Again
          </button>
        )}

        {isActiveGeneration && onKeepCreating && !isEditingEmail && (
          <button
            type="button"
            onClick={onKeepCreating}
            className="mt-6 inline-flex h-11 items-center justify-center rounded-full border border-[hsl(var(--formanova-hero-accent))] bg-background px-6 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--formanova-hero-accent))] transition-colors hover:bg-[hsl(var(--formanova-hero-accent))]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Keep Creating
          </button>
        )}
      </motion.section>
    </div>
  );
}
