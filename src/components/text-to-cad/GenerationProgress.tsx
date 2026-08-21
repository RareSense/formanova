import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Diamond, Mail, Pencil } from "lucide-react";
import { isValidNotificationEmail } from "@/lib/notification-email-api";
import { Switch } from "@/components/ui/switch";

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
  success_original_glb: "Your CAD is ready",
  failed_final: "Could not complete generation",
  _loading: "Loading model into viewport",
  analyzing: "Analyzing your design",
  building: "Building your CAD",
  repairing: "Fixing the model",
};

interface GenerationProgressProps {
  visible: boolean;
  currentStep: string;
  onRetry?: () => void;
  estimateText?: string;
  failureMessage?: string | null;
  notificationEmail?: string | null;
  /** The raw saved override. Null means unset, so the input opens empty. */
  storedNotificationEmail?: string | null;
  emailEnabled?: boolean;
  onToggleEmailEnabled?: (enabled: boolean) => void;
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
  estimateText = "up to 1 hour",
  failureMessage,
  notificationEmail,
  storedNotificationEmail,
  emailEnabled = true,
  onToggleEmailEnabled,
  notificationEmailLoading = false,
  notificationEmailSaving = false,
  notificationEmailError,
  onSaveNotificationEmail,
  onKeepCreating,
}: GenerationProgressProps) {
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState(storedNotificationEmail ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const changeEmailButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditingEmailRef = useRef(false);

  useEffect(() => {
    if (!isEditingEmail) setEmailDraft(storedNotificationEmail ?? "");
  }, [isEditingEmail, storedNotificationEmail]);

  // Move focus into the overlay when it appears, and back to the "Use a
  // different email" trigger when its form closes, so keyboard/screen-reader
  // users aren't left on a control that just disappeared.
  useEffect(() => {
    if (visible) sectionRef.current?.focus();
  }, [visible]);

  // Switching the toggle off unmounts the edit form. Without this the
  // component stays in editing state with no form on screen, and Keep
  // Creating, which is gated on not editing, disappears with no way back.
  useEffect(() => {
    if (!emailEnabled) setIsEditingEmail(false);
  }, [emailEnabled]);

  useEffect(() => {
    if (wasEditingEmailRef.current && !isEditingEmail) changeEmailButtonRef.current?.focus();
    wasEditingEmailRef.current = isEditingEmail;
  }, [isEditingEmail]);


  if (!visible) return null;

  const isFailed = currentStep === "failed_final";
  const isDone = currentStep === "success_final" || currentStep === "success_original_glb";
  const isLoadingModel = currentStep === "_loading";
  const isTerminal = isFailed || isDone;
  const isActiveGeneration = !isTerminal && !isLoadingModel;
  const label = NODE_LABELS[currentStep] || "Preparing your design";
  const emailError = validationError ?? notificationEmailError;

  const beginEmailEdit = () => {
    setEmailDraft(storedNotificationEmail ?? "");
    setValidationError(null);
    setIsEditingEmail(true);
  };

  const cancelEmailEdit = () => {
    setEmailDraft(storedNotificationEmail ?? "");
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
        ref={sectionRef}
        tabIndex={-1}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="w-full max-w-[560px] px-2 py-5 text-center outline-none sm:px-8"
        aria-labelledby="cad-generation-heading"
      >
        <div
          role={isFailed ? "alert" : "status"}
          aria-live={isFailed ? "assertive" : "polite"}
          aria-atomic="true"
        >
          {/* Neutral mark, accent reserved for the one moving arc: an
              all-accent spinner competed with the copy for attention. */}
          {!isTerminal && (
            <div className="relative mx-auto mb-8 h-24 w-24" aria-hidden="true">
              <div className="h-24 w-24 animate-spin rounded-full border-4 border-border/40 border-t-[hsl(var(--formanova-hero-accent))]" />
              <Diamond className="absolute inset-0 m-auto h-10 w-10 text-foreground" strokeWidth={1.8} />
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
              {/* No "Generation in progress" eyebrow: the heading directly
                  below already says it, and the spinner says it again. */}
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
                  {/* The duration is the one thing worth colouring: it is what
                      the user is actually deciding around. */}
                  <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-[15px]">
                    Estimated time:{" "}
                    <span className="font-semibold text-[hsl(var(--formanova-hero-accent))]">{estimateText}</span>
                  </p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    You can leave this page. We&rsquo;ll email you when your CAD is ready.
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
            {/* One bordered group: the switch and the address it governs read
                as a single setting rather than two stacked hairline rows. */}
            <div className="mx-auto max-w-[470px] border border-border/60 px-4 py-5 sm:px-6">
            {/* The switch owns the icon and the whole row, so the address
                below it reads as a detail of the thing being switched on. */}
            <div className="flex items-center gap-3 text-left">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {/* Accurate today: the toggle gates audience == "user", and the
                  only user-facing mail CAD sends is the result. Failures go to
                  admins only. The gate is not scoped to results though, so if a
                  user-facing workflow_failed template is ever added to the spec
                  the same toggle silences that too, and this label has to become
                  outcome-agnostic ("Email me about this run") or split in two. */}
              <label htmlFor="cad-notification-toggle" className="min-w-0 flex-1 text-sm text-foreground">
                Email me when this is ready
              </label>
              {onToggleEmailEnabled && (
                <Switch
                  id="cad-notification-toggle"
                  checked={emailEnabled}
                  onCheckedChange={onToggleEmailEnabled}
                  disabled={notificationEmailLoading}
                  className="shrink-0"
                />
              )}
            </div>

            {/* Hidden rather than dimmed when off: there is no destination to
                show for mail that is not going to be sent.

                The pl-7 matches the icon plus gap above, so the address lines
                up with the label rather than the icon, and the rule sits back
                at the icon's edge to tie the two rows together. Both only from
                sm up: on a narrow phone the edit row needs every pixel for the
                input, Save and Cancel. */}
            {emailEnabled && (
            <div className="mt-4 sm:border-l sm:border-border/60 sm:pl-7">
            {!isEditingEmail ? (
              <div className="flex items-center gap-3 text-left">
                <p className="min-w-0 truncate text-sm text-foreground">
                  {notificationEmailLoading && !notificationEmail ? "your account email" : notificationEmail ?? "your account email"}
                </p>
                {onSaveNotificationEmail && (
                  <button
                    ref={changeEmailButtonRef}
                    type="button"
                    onClick={beginEmailEdit}
                    /* leading-5 matches the address's text-sm line box (20px).
                       text-xs alone is a 16px line box, and items-center centres
                       the boxes rather than the baselines, so the shorter box
                       lifts this text and the pencil above the address. Equal
                       line boxes put them on one baseline without nudging
                       anything with margins or transforms. */
                    className="inline-flex shrink-0 items-center gap-1.5 text-xs leading-5 font-medium text-[hsl(var(--formanova-hero-accent))] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Change
                    <Pencil className="h-3 w-3" aria-hidden="true" />
                  </button>
                )}
              </div>
            ) : (
              <form className="flex items-center gap-3 text-left" onSubmit={submitEmail} noValidate>
                <label htmlFor="cad-notification-email" className="sr-only">
                  Notification email
                </label>
                <input
                  id="cad-notification-email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  value={emailDraft}
                  onChange={event => {
                    setEmailDraft(event.target.value);
                    setValidationError(null);
                  }}
                  aria-invalid={Boolean(emailError)}
                  aria-describedby={emailError ? "cad-notification-email-error" : undefined}
                  disabled={notificationEmailSaving}
                  className="h-9 min-w-0 flex-1 border border-border bg-background px-2.5 text-sm text-foreground outline-none transition-colors focus:border-[hsl(var(--formanova-hero-accent))] focus:ring-1 focus:ring-[hsl(var(--formanova-hero-accent))] disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={notificationEmailSaving}
                  className="shrink-0 text-xs font-medium text-[hsl(var(--formanova-hero-accent))] transition-colors hover:text-foreground disabled:opacity-60"
                >
                  {notificationEmailSaving ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={cancelEmailEdit}
                  disabled={notificationEmailSaving}
                  className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
                >
                  Cancel
                </button>
              </form>
            )}
            {emailError && (
              <p id="cad-notification-email-error" role="alert" className="mt-2 text-left text-xs text-destructive">
                {emailError}
              </p>
            )}
            </div>
            )}
            </div>
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
          <>
          <div className="mx-auto mt-6 h-px w-full max-w-[470px] bg-border/40" aria-hidden="true" />
          <button
            type="button"
            onClick={onKeepCreating}
            className="mt-6 inline-flex h-11 items-center justify-center gap-2 border border-[hsl(var(--formanova-hero-accent))]/60 bg-[hsl(var(--formanova-hero-accent))]/5 px-6 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-foreground transition-colors hover:border-[hsl(var(--formanova-hero-accent))] hover:bg-[hsl(var(--formanova-hero-accent))]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Keep Creating
            <ArrowRight className="h-4 w-4 shrink-0" />
          </button>
          </>
        )}
      </motion.section>
    </div>
  );
}
