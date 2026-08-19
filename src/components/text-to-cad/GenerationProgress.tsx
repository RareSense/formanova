import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Diamond, Mail, Pencil } from "lucide-react";
import { isValidNotificationEmail } from "@/lib/notification-email-api";
import { isValidAltDeliveryContact, type AltDeliveryChannel, type AltDeliveryPreference } from "@/lib/alt-delivery-preference";

/** Dial codes we see most; the list stays short deliberately so the control
 * reads as a picker rather than a wall of countries. */
const DIAL_CODES = [
  { code: "+1", label: "US/CA" },
  { code: "+44", label: "UK" },
  { code: "+91", label: "IN" },
  { code: "+971", label: "AE" },
  { code: "+92", label: "PK" },
  { code: "+61", label: "AU" },
  { code: "+49", label: "DE" },
  { code: "+33", label: "FR" },
  { code: "+39", label: "IT" },
  { code: "+86", label: "CN" },
] as const;

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
  /** Client-only preference (see alt-delivery-preference.ts) — no backend field exists yet. */
  altDeliveryPreference?: AltDeliveryPreference | null;
  altDeliveryRequesting?: boolean;
  altDeliveryError?: string | null;
  altDeliveryRequested?: boolean;
  onRequestAltDelivery?: (channel: AltDeliveryChannel, contact: string) => Promise<boolean>;
  onKeepCreating?: () => void;
}

export default function GenerationProgress({
  visible,
  currentStep,
  onRetry,
  estimateText = "up to 1 hour",
  failureMessage,
  notificationEmail,
  notificationEmailLoading = false,
  notificationEmailSaving = false,
  notificationEmailError,
  onSaveNotificationEmail,
  altDeliveryPreference,
  altDeliveryRequesting = false,
  altDeliveryError,
  altDeliveryRequested = false,
  onRequestAltDelivery,
  onKeepCreating,
}: GenerationProgressProps) {
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState(notificationEmail ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isEditingAltDelivery, setIsEditingAltDelivery] = useState(false);
  const [altChannelDraft, setAltChannelDraft] = useState<AltDeliveryChannel>(altDeliveryPreference?.channel ?? "whatsapp");
  const [altContactDraft, setAltContactDraft] = useState(altDeliveryPreference?.contact ?? "");
  const [altDialCode, setAltDialCode] = useState(DIAL_CODES[0].code);
  const [altValidationError, setAltValidationError] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const changeEmailButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditingEmailRef = useRef(false);
  const altDeliveryButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditingAltDeliveryRef = useRef(false);

  useEffect(() => {
    if (!isEditingEmail) setEmailDraft(notificationEmail ?? "");
  }, [isEditingEmail, notificationEmail]);

  // Move focus into the overlay when it appears, and back to the "Use a
  // different email" trigger when its form closes, so keyboard/screen-reader
  // users aren't left on a control that just disappeared.
  useEffect(() => {
    if (visible) sectionRef.current?.focus();
  }, [visible]);

  useEffect(() => {
    if (wasEditingEmailRef.current && !isEditingEmail) changeEmailButtonRef.current?.focus();
    wasEditingEmailRef.current = isEditingEmail;
  }, [isEditingEmail]);

  useEffect(() => {
    if (wasEditingAltDeliveryRef.current && !isEditingAltDelivery) altDeliveryButtonRef.current?.focus();
    wasEditingAltDeliveryRef.current = isEditingAltDelivery;
  }, [isEditingAltDelivery]);

  if (!visible) return null;

  const isFailed = currentStep === "failed_final";
  const isDone = currentStep === "success_final" || currentStep === "success_original_glb";
  const isLoadingModel = currentStep === "_loading";
  const isTerminal = isFailed || isDone;
  const isActiveGeneration = !isTerminal && !isLoadingModel;
  const label = NODE_LABELS[currentStep] || "Preparing your design";
  const emailError = validationError ?? notificationEmailError;
  const altError = altValidationError ?? altDeliveryError;

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

  const submitAltDelivery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // The stored contact is always the full international number, so the
    // person messaging back never has to guess the country. A pasted number
    // that already carries its own "+" is left alone rather than double-prefixed.
    const typedContact = altContactDraft.trim();
    const normalizedContact = typedContact.startsWith("+")
      ? typedContact
      : `${altDialCode} ${typedContact}`.trim();
    if (!isValidAltDeliveryContact(normalizedContact)) {
      setAltValidationError("Enter a valid phone number.");
      return;
    }
    setAltValidationError(null);
    if (await onRequestAltDelivery?.(altChannelDraft, normalizedContact)) setIsEditingAltDelivery(false);
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
                    You can leave this page. We&rsquo;ll send your CAD when it&rsquo;s ready.
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
            {/* One row, edit in place: the label and value stay put and only
                the value becomes editable, so the layout does not jump. */}
            <div className="mx-auto max-w-[470px] border-y border-border/40 py-3">
            {!isEditingEmail ? (
              <div className="flex items-center gap-3 text-left">
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] leading-4 text-muted-foreground">Send to</p>
                  <p className="truncate text-sm text-foreground">
                    {notificationEmailLoading && !notificationEmail ? "your account email" : notificationEmail ?? "your account email"}
                  </p>
                </div>
                {onSaveNotificationEmail && (
                  <button
                    ref={changeEmailButtonRef}
                    type="button"
                    onClick={beginEmailEdit}
                    className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-[hsl(var(--formanova-hero-accent))] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Change
                    <Pencil className="h-3 w-3" aria-hidden="true" />
                  </button>
                )}
              </div>
            ) : (
              <form className="flex items-center gap-3 text-left" onSubmit={submitEmail} noValidate>
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <label htmlFor="cad-notification-email" className="shrink-0 text-[11px] text-muted-foreground">
                  Send to
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
          </div>
        )}

        {isActiveGeneration && onRequestAltDelivery && (
          <div className="mt-3">
            {!isEditingAltDelivery ? (
              altDeliveryRequested || altDeliveryPreference ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  We’ve also asked our team to reach out on{" "}
                  <strong className="font-semibold text-foreground">
                    {altDeliveryPreference?.channel === "imessage" ? "iMessage" : "WhatsApp"}
                  </strong>
                  {altDeliveryPreference?.contact ? <> at {altDeliveryPreference.contact}</> : null}.{" "}
                  <button
                    ref={altDeliveryButtonRef}
                    type="button"
                    onClick={() => setIsEditingAltDelivery(true)}
                    className="border-b border-[hsl(var(--formanova-hero-accent))]/70 bg-transparent text-[11px] font-medium text-[hsl(var(--formanova-hero-accent))] transition-colors hover:border-[hsl(var(--formanova-hero-accent))] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Change
                  </button>
                </p>
              ) : (
                <button
                  ref={altDeliveryButtonRef}
                  type="button"
                  onClick={() => setIsEditingAltDelivery(true)}
                  className="border-b border-[hsl(var(--formanova-hero-accent))]/70 bg-transparent text-[11px] font-medium text-[hsl(var(--formanova-hero-accent))] transition-colors hover:border-[hsl(var(--formanova-hero-accent))] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Use WhatsApp or iMessage instead
                </button>
              )
            ) : (
              <form className="mx-auto max-w-[470px] text-left" onSubmit={submitAltDelivery} noValidate>
                <span className="text-xs font-semibold text-foreground">Notify me on</span>
                <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Delivery channel">
                  {(["whatsapp", "imessage"] as const).map((channel) => (
                    <button
                      key={channel}
                      type="button"
                      role="radio"
                      aria-checked={altChannelDraft === channel}
                      onClick={() => setAltChannelDraft(channel)}
                      className={`h-9 flex-1 border px-3 font-mono text-[10px] font-bold uppercase tracking-[0.1em] transition-colors ${
                        altChannelDraft === channel
                          ? "border-[hsl(var(--formanova-hero-accent))] bg-[hsl(var(--formanova-hero-accent))]/10 text-[hsl(var(--formanova-hero-accent))]"
                          : "border-foreground/25 text-muted-foreground hover:border-foreground/45 hover:text-foreground"
                      }`}
                    >
                      {channel === "whatsapp" ? "WhatsApp" : "iMessage"}
                    </button>
                  ))}
                </div>
                <label htmlFor="cad-alt-delivery-contact" className="mt-3 block text-xs font-semibold text-foreground">
                  Phone number
                </label>
                <div className="mt-2 flex gap-2">
                  <select
                    aria-label="Country code"
                    value={altDialCode}
                    onChange={event => {
                      setAltDialCode(event.target.value);
                      setAltValidationError(null);
                    }}
                    disabled={altDeliveryRequesting}
                    className="h-11 shrink-0 border border-foreground/35 bg-background px-2 text-sm text-foreground outline-none transition-colors focus:border-[hsl(var(--formanova-hero-accent))] focus:ring-1 focus:ring-[hsl(var(--formanova-hero-accent))] disabled:opacity-60"
                  >
                    {DIAL_CODES.map(({ code, label }) => (
                      <option key={label} value={code}>{`${label} ${code}`}</option>
                    ))}
                  </select>
                  <input
                    id="cad-alt-delivery-contact"
                    type="tel"
                    autoComplete="tel-national"
                    autoFocus
                    value={altContactDraft}
                    onChange={event => {
                      setAltContactDraft(event.target.value);
                      setAltValidationError(null);
                    }}
                    aria-invalid={Boolean(altError)}
                    aria-describedby={altError ? "cad-alt-delivery-error" : undefined}
                    disabled={altDeliveryRequesting}
                    placeholder="555 123 4567"
                    className="h-11 w-full min-w-0 border border-foreground/35 bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-[hsl(var(--formanova-hero-accent))] focus:ring-1 focus:ring-[hsl(var(--formanova-hero-accent))] disabled:opacity-60"
                  />
                </div>
                {altError && (
                  <p id="cad-alt-delivery-error" role="alert" className="mt-2 text-xs text-destructive">
                    {altError}
                  </p>
                )}
                <div className="mt-3 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsEditingAltDelivery(false)}
                    disabled={altDeliveryRequesting}
                    className="h-9 px-4 text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={altDeliveryRequesting}
                    className="h-9 border border-foreground/45 bg-background px-5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-accent/60 disabled:opacity-60"
                  >
                    {altDeliveryRequesting ? "Sending…" : "Send request"}
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

        {isActiveGeneration && onKeepCreating && !isEditingEmail && !isEditingAltDelivery && (
          <button
            type="button"
            onClick={onKeepCreating}
            className="mt-6 inline-flex h-11 items-center justify-center gap-2 border border-[hsl(var(--formanova-hero-accent))]/60 bg-[hsl(var(--formanova-hero-accent))]/5 px-6 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-foreground transition-colors hover:border-[hsl(var(--formanova-hero-accent))] hover:bg-[hsl(var(--formanova-hero-accent))]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Keep Creating
            <ArrowRight className="h-4 w-4 shrink-0" />
          </button>
        )}
      </motion.section>
    </div>
  );
}
