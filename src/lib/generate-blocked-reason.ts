/**
 * Why the studio's "Generate Photoshoot" button is greyed out, in words the
 * user can act on. Mirrors the button's own `disabled` rule in StudioModelStep.
 */
export interface GenerateBlockedState {
  isProductShot: boolean;
  jewelryImage: string | null;
  activeModelUrl: string | null;
  preflightChecking: boolean;
  isModelUploading: boolean;
}

/** Null when Generate is usable, or while the button already shows a spinner. */
export function generateBlockedReason(s: GenerateBlockedState): string | null {
  if (s.preflightChecking || s.isModelUploading) return null;
  if (!s.jewelryImage) return 'Go back and upload your jewelry first';
  if (!s.activeModelUrl) {
    return s.isProductShot
      ? 'Choose or upload an inspiration to continue'
      : 'Choose or upload a model to continue';
  }
  return null;
}
