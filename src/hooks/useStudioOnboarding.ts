/**
 * useStudioOnboarding — manages the upload-guide and product-shot-guide onboarding popups.
 *
 * Extracted from UnifiedStudio.tsx (phase 36) to reduce the page file size.
 *
 * Owns:
 *   - uploadGuideOpen / productShotGuideOpen state
 *   - hasCheckedUploadGuide / hasCheckedProductShotGuide refs (returned so StudioTestMenu can reset them)
 *   - Both gated onboarding effects
 *   - handleUploadGuideClose / handleProductShotGuideClose callbacks
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  checkUploadInstructionsSeen,
  isTosAgreed,
  markTosAgreed,
  markUploadInstructionsSeen,
  checkProductShotGuideSeen,
  markProductShotGuideSeen,
  isProductShotGuideSeen,
  markProductShotGuideSeenLocal,
} from '@/lib/onboarding-api';
import { trackUploadGuideViewed, trackUploadGuideAcknowledged, trackProductShotGuideViewed, trackProductShotGuideAcknowledged } from '@/lib/posthog-events';

type StudioStep = 'upload' | 'model' | 'generating' | 'results';

interface UseStudioOnboardingOptions {
  currentStep: StudioStep;
  isProductShot: boolean;
  user: { id?: string; email?: string } | null;
  initializing: boolean;
}

export function useStudioOnboarding({
  currentStep,
  isProductShot,
  user,
  initializing,
}: UseStudioOnboardingOptions) {
  const [uploadGuideOpen, setUploadGuideOpen] = useState(false);
  const [productShotGuideOpen, setProductShotGuideOpen] = useState(false);

  const hasCheckedUploadGuide = useRef(false);
  const hasCheckedProductShotGuide = useRef(false);

  // Upload guide — shown once on first visit to Step 1 in model-shot mode for gated users who haven't agreed to TOS
  useEffect(() => {
    if (initializing || !user || hasCheckedUploadGuide.current) return;
    if (currentStep !== 'upload') return;
    if (isProductShot) return;

    hasCheckedUploadGuide.current = true;

    if (isTosAgreed(user.id)) return;

    checkUploadInstructionsSeen()
      .then((seenOnBackend) => {
        if (seenOnBackend) {
          markTosAgreed(user.id);
          return;
        }
        setUploadGuideOpen(true);
        trackUploadGuideViewed();
      })
      .catch(() => {
        setUploadGuideOpen(true);
        trackUploadGuideViewed();
      });
  }, [currentStep, initializing, isProductShot, user?.email, user?.id]);

  const handleUploadGuideClose = useCallback(() => {
    setUploadGuideOpen(false);
    if (!user) return;
    markTosAgreed(user.id);
    trackUploadGuideAcknowledged();
    markUploadInstructionsSeen().catch(() => {});
  }, [user]);

  // Product shot guide — shown once on first visit to Step 1 in product-shot mode for gated users
  useEffect(() => {
    if (initializing || !user || hasCheckedProductShotGuide.current) return;
    if (!isProductShot) return;
    if (currentStep !== 'upload') return;

    hasCheckedProductShotGuide.current = true;

    if (isProductShotGuideSeen(user.id)) return;

    checkProductShotGuideSeen()
      .then((seenOnBackend) => {
        if (seenOnBackend) {
          markProductShotGuideSeenLocal(user.id);
          return;
        }
        setProductShotGuideOpen(true);
        trackProductShotGuideViewed();
      })
      .catch(() => {
        setProductShotGuideOpen(true);
        trackProductShotGuideViewed();
      });
  }, [currentStep, initializing, isProductShot, user?.email, user?.id]);

  const handleProductShotGuideClose = useCallback(() => {
    setProductShotGuideOpen(false);
    if (!user) return;
    markProductShotGuideSeenLocal(user.id);
    markProductShotGuideSeen().catch(() => {});
    trackProductShotGuideAcknowledged();
  }, [user]);

  return {
    uploadGuideOpen,
    setUploadGuideOpen,
    productShotGuideOpen,
    setProductShotGuideOpen,
    handleUploadGuideClose,
    handleProductShotGuideClose,
    hasCheckedUploadGuide,
    hasCheckedProductShotGuide,
  };
}
