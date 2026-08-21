// Hook for credit preflight validation with modal UI
// Wraps performCreditPreflight and manages insufficient credits modal state

import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { performCreditPreflight, type PreflightResult } from '@/lib/credit-preflight';
import { AuthExpiredError } from '@/lib/authenticated-fetch';
import { savePostPurchaseReturn } from '@/lib/post-purchase-return';

/** Optional pricing metadata forwarded to the estimate endpoint. */
export interface CreditPreflightMetadata {
  model?: string;
  /** Extra context the backend needs to price the run (e.g. upscale image_size + factor). */
  pricingContext?: Record<string, unknown>;
}

export interface UseCreditPreflightOptions {
  /**
   * Whether a blocked run sends the user to the credits page.
   *
   * True (the default) is the canonical behaviour for a paid workflow: no
   * workflow is started, nothing is charged, the current location is saved so
   * the user resumes after buying, and they are taken to /credits with the
   * shortfall.
   *
   * Pass false only when the call site genuinely needs to stay put and render
   * its own UI. PhotoCard does, because it is a card inside a list rather than
   * a full-page flow. Opting out is deliberate and explicit so that the
   * default remains one shared behaviour rather than a per-page invention.
   */
  redirectOnInsufficient?: boolean;
}

export interface UseCreditPreflightReturn {
  /** Run preflight check. Returns true if approved, false if blocked. */
  checkCredits: (
    workflowName: string,
    numVariations?: number,
    metadata?: CreditPreflightMetadata,
  ) => Promise<boolean>;
  /** Whether the insufficient credits modal should be shown */
  showInsufficientModal: boolean;
  /** Close the modal */
  dismissModal: () => void;
  /** Last preflight result (for rendering modal content) */
  preflightResult: PreflightResult | null;
  /** Whether a preflight check is currently in progress */
  checking: boolean;
}

export function useCreditPreflight(
  { redirectOnInsufficient = true }: UseCreditPreflightOptions = {},
): UseCreditPreflightReturn {
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [preflightResult, setPreflightResult] = useState<PreflightResult | null>(null);
  const [checking, setChecking] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const checkCredits = useCallback(async (
    workflowName: string,
    numVariations: number = 1,
    metadata?: CreditPreflightMetadata,
  ): Promise<boolean> => {
    setChecking(true);
    try {
      const result = await performCreditPreflight(workflowName, numVariations, metadata);
      setPreflightResult(result);

      if (!result.approved) {
        setShowInsufficientModal(true);
        return false;
      }

      return true;
    } catch (error) {
      // AuthExpiredError is already handled by authenticatedFetch (redirect to /login)
      if (error instanceof AuthExpiredError) return false;
      throw error;
    } finally {
      setChecking(false);
    }
  }, []);

  const dismissModal = useCallback(() => {
    setShowInsufficientModal(false);
  }, []);

  /**
   * Door-in: a run blocked by insufficient credits sends the user to the
   * credits page with the shortfall rather than showing a popup they have to
   * dismiss. Their work is already persisted, so the saved return path brings
   * them back to exactly where they were once they buy.
   *
   * This lived inside UnifiedStudio.tsx, which meant only that page could have
   * it. CAD could not reuse it and grew a second flow that went to /pricing
   * and never saved a return path. Owning it here is what makes every paid
   * workflow behave the same by default.
   */
  useEffect(() => {
    if (!redirectOnInsufficient) return;
    if (!showInsufficientModal || !preflightResult) return;

    savePostPurchaseReturn(`${location.pathname}${location.search}`);
    setShowInsufficientModal(false);
    navigate('/credits', { state: { requiredCredits: preflightResult.estimatedCredits } });
  }, [redirectOnInsufficient, showInsufficientModal, preflightResult, location.pathname, location.search, navigate]);

  return {
    checkCredits,
    showInsufficientModal,
    dismissModal,
    preflightResult,
    checking,
  };
}
