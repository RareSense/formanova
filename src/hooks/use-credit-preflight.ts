// Hook for credit preflight validation with modal UI
// Wraps performCreditPreflight and manages insufficient credits modal state

import { useState, useCallback } from 'react';
import { performCreditPreflight, type PreflightResult } from '@/lib/credit-preflight';
import { AuthExpiredError } from '@/lib/authenticated-fetch';

/** Optional pricing metadata forwarded to the estimate endpoint. */
export interface CreditPreflightMetadata {
  model?: string;
  /** Extra context the backend needs to price the run (e.g. upscale image_size + factor). */
  pricingContext?: Record<string, unknown>;
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

export function useCreditPreflight(): UseCreditPreflightReturn {
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [preflightResult, setPreflightResult] = useState<PreflightResult | null>(null);
  const [checking, setChecking] = useState(false);

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

  return {
    checkCredits,
    showInsufficientModal,
    dismissModal,
    preflightResult,
    checking,
  };
}
