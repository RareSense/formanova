/**
 * StudioUploadStep
 *
 * Pure render component for Step 1 of UnifiedStudio (upload jewelry image).
 *
 * WHY THIS EXISTS
 * ---------------
 * Extracted from UnifiedStudio.tsx (phase 31) to reduce the page file size.
 * It has NO internal state -- all values and callbacks are passed as props.
 *
 * WHAT IT RENDERS
 * ---------------
 * - The Step 1 upload zone (drop zone or image preview) when currentStep === 'upload'
 * - The StudioVaultUploadStep layout
 * - The Upload Guide sidebar
 *
 * HOW TO USE
 * ----------
 * Rendered unconditionally by UnifiedStudio replacing the upload block + dialog:
 *
 *   <StudioUploadStep
 *     currentStep={currentStep}
 *     user={user}
 *     isProductShot={isProductShot}
 *     ...all other props...
 *   />
 */
import { motion } from 'framer-motion';
import {
  Diamond,
  Image as ImageIcon,
  X,
  Check,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StudioVaultUploadStep } from '@/components/studio/StudioVaultUploadStep';
import type { EffortLevel } from '@/components/studio/EffortToggle';
import type { SupportingImage } from '@/hooks/useSupportingImages';
import { CATEGORY_EXAMPLES } from '@/lib/studio-examples';
import type { AuthUser } from '@/lib/auth-api';

interface StudioUploadStepProps {
  user: AuthUser | null;
  isProductShot: boolean;
  effort: EffortLevel;
  onEffortChange: (v: EffortLevel) => void;
  effortModeEnabled: boolean;
  supportingImages: SupportingImage[];
  addSupportingImages: (files: File[]) => void;
  setVaultSupporting: (entries: { url: string; assetId: string }[]) => void;
  removeSupportingImage: (index: number) => void;
  effectiveJewelryType: string;
  exampleCategoryType: string;
  currentStep: string;
  jewelryImage: string | null;
  resolvedJewelryImage: string | null;
  jewelryAssetId: string | null;
  canProceed: boolean;
  jewelryInputRef: React.RefObject<HTMLInputElement>;
  handleJewelryUpload: (file: File) => void;
  handleNextStep: () => void;
  clearStudioSession: () => void;
  setJewelryImage: (url: string | null) => void;
  setJewelryFile: (file: File | null) => void;
  setJewelryUploadedUrl: (url: string | null) => void;
  setJewelrySasUrl: (url: string | null) => void;
  setJewelryAssetId: (id: string | null) => void;
  setCurrentStep: (step: string) => void;
  setOverrideJewelryType: (cat: string) => void;
}

export function StudioUploadStep({
  user,
  isProductShot,
  effort,
  onEffortChange,
  effortModeEnabled,
  supportingImages,
  addSupportingImages,
  setVaultSupporting,
  removeSupportingImage,
  effectiveJewelryType,
  exampleCategoryType,
  currentStep,
  jewelryImage,
  resolvedJewelryImage,
  jewelryAssetId,
  canProceed,
  jewelryInputRef,
  handleJewelryUpload,
  handleNextStep,
  clearStudioSession,
  setJewelryImage,
  setJewelryFile,
  setJewelryUploadedUrl,
  setJewelrySasUrl,
  setJewelryAssetId,
  setCurrentStep,
  setOverrideJewelryType,
}: StudioUploadStepProps) {
  return (
    <>
      {/* ═══════════════════════════════════════════════════════════
          STEP 1 — UPLOAD YOUR JEWELRY
          ═══════════════════════════════════════════════════════════ */}
      {currentStep === 'upload' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* ── Alternate layout (internal experiment) ── */}
          {true ? (
            <StudioVaultUploadStep
              exampleCategoryType={exampleCategoryType}
              jewelryImage={jewelryImage}
              activeProductAssetId={jewelryAssetId}
              canProceed={canProceed}
              jewelryInputRef={jewelryInputRef}
              onFileUpload={handleJewelryUpload}
              onClearImage={() => {
                clearStudioSession();
                setJewelryImage(null);
                setJewelryFile(null);
                setJewelryUploadedUrl(null);
                setJewelryAssetId(null);
                if ((currentStep as string) === 'model') setCurrentStep('upload');
              }}
              onNextStep={handleNextStep}
              onCategoryChange={(cat) => setOverrideJewelryType(cat)}
              isProductShot={isProductShot}
              effort={effort}
              onEffortChange={onEffortChange}
              effortModeEnabled={effortModeEnabled}
              supportingImages={supportingImages}
              addSupportingImages={addSupportingImages}
              removeSupportingImage={removeSupportingImage}
              onProductSelect={(thumbnailUrl, assetId, supportingMembers) => {
                setJewelryImage(thumbnailUrl);
                setJewelryUploadedUrl(thumbnailUrl);
                setJewelryAssetId(assetId);
                setJewelryFile(null);
                // Grouped set: load its other angles as reusable vault supporting
                // entries. Ungrouped product: clear any lingering angles.
                setVaultSupporting(supportingMembers ?? []);
              }}
            />
          ) : (
          <>
          {/* Step 1 Header */}
          <div className="mb-6">
            <span className="marta-label">Step 1</span>
            <h1 className="font-display text-3xl md:text-4xl uppercase tracking-tight mt-2">
              Upload Your Jewelry
            </h1>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Upload a photo of your jewelry <strong>worn on a person or mannequin</strong>
            </p>
          </div>

          {/* Layout — Upload LEFT (2/3), Guide Sidebar RIGHT (1/3) — mirrors old StepUploadMark */}
          <div className="grid lg:grid-cols-3 gap-8 lg:gap-10">
            {/* ── Main Column: Upload Zone (2/3) ── */}
            <div className="lg:col-span-2">
              {!jewelryImage ? (
                /* Empty state — drop zone */
                <div
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleJewelryUpload(f); }}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => jewelryInputRef.current?.click()}
                  className="relative border border-dashed border-border/40 text-center cursor-pointer hover:border-foreground/40 hover:bg-foreground/5 transition-all flex flex-col items-center justify-center min-h-[500px] md:min-h-[640px]"
                >
                  <div className="relative mx-auto w-20 h-20 mb-6">
                    <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" style={{ animationDuration: '2.5s' }} />
                    <div className="absolute inset-0 rounded-full bg-primary/5 flex items-center justify-center border-2 border-primary/20">
                      <Diamond className="h-9 w-9 text-primary" />
                    </div>
                  </div>
                  <p className="text-lg font-display font-medium mb-1.5">Drop your jewelry image here</p>
                  <p className="text-sm text-muted-foreground mb-6">
                    Drag & drop · click to browse · paste (Ctrl+V)
                  </p>
                  <Button variant="outline" size="lg" className="gap-2">
                    <ImageIcon className="h-4 w-4" />
                    Browse Files
                  </Button>
                  <input
                    ref={jewelryInputRef}
                    type="file"
                    accept="image/*,.jfif,.pjpeg,.jpe"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleJewelryUpload(f); }}
                  />
                </div>
              ) : (
                /* Uploaded state — image preview */
                <div className="space-y-4">
                  <div className="relative border overflow-hidden flex items-center justify-center bg-muted/20 min-h-[500px] md:min-h-[640px] border-border/30">
                    <img src={resolvedJewelryImage ?? undefined} alt="Jewelry" className="max-w-full max-h-[520px] object-contain" />

                    <button
                      onClick={() => { clearStudioSession(); setJewelryImage(null); setJewelryFile(null); setJewelryUploadedUrl(null); setJewelrySasUrl(null); setJewelryAssetId(null); if ((currentStep as string) === 'model') setCurrentStep('upload'); }}
                      className="absolute top-3 right-3 w-7 h-7 bg-background/80 backdrop-blur-sm flex items-center justify-center border border-border/40 hover:bg-destructive hover:text-destructive-foreground transition-colors z-10 rounded-sm"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                </div>
              )}

              {/* Next button — inline below upload canvas */}
              {jewelryImage && (
                <div className="flex items-center justify-end gap-3 pt-4">
                  <Button
                    size="lg"
                    onClick={handleNextStep}
                    disabled={!canProceed}
                    className="gap-2.5 font-display text-base uppercase tracking-wide px-10 bg-gradient-to-r from-[hsl(var(--formanova-hero-accent))] to-[hsl(var(--formanova-glow))] text-background hover:opacity-90 transition-opacity border-0 disabled:opacity-60 disabled:from-[hsl(var(--formanova-hero-accent))] disabled:to-[hsl(var(--formanova-glow))]"
                  >
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* ── Sidebar: Upload Guide (1/3) — mirrors old Examples sidebar ── */}
            <div className="space-y-7">
              {/* Guide heading — matches old "Gallery" marta-label style */}
              <div>
                <span className="marta-label mb-2 block">Guide</span>
                <h3 className="font-display text-2xl uppercase tracking-tight">Upload Guide</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  Follow these guidelines for best results.
                </p>
              </div>

              {/* Accepted examples */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <Check className="w-2.5 h-2.5 text-green-500" />
                  </div>
                  <span className="text-xs font-medium text-foreground">Accepted</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(CATEGORY_EXAMPLES[exampleCategoryType]?.allowed || []).map((img, i) => (
                    <div key={`ok-${i}`} className="relative aspect-[3/4] overflow-hidden border border-green-500/30 bg-muted/20">
                      <img src={img} alt={`Accepted ${i + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute bottom-1 right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-white" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Not accepted examples */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0">
                    <X className="w-2.5 h-2.5 text-destructive" />
                  </div>
                  <span className="text-xs font-medium text-foreground">Not Accepted</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(CATEGORY_EXAMPLES[exampleCategoryType]?.notAllowed || []).map((img, i) => (
                    <div key={`no-${i}`} className="relative aspect-[3/4] overflow-hidden border border-destructive/30 bg-muted/20">
                      <img src={img} alt={`Not accepted ${i + 1}`} className="w-full h-full object-cover opacity-70" />
                      <div className="absolute bottom-1 right-1 w-4 h-4 bg-destructive rounded-full flex items-center justify-center">
                        <X className="w-2.5 h-2.5 text-white" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          </>
          )}
        </motion.div>
      )}

    </>
  );
}
