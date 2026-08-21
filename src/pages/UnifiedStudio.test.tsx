import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

import UnifiedStudio from './UnifiedStudio';

// heic2any touches Worker/canvas at import time, which jsdom doesn't provide.
vi.mock('heic2any', () => ({ default: vi.fn() }));

// ── framer-motion ──────────────────────────────────────────────────────────
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_, tag: keyof JSX.IntrinsicElements) => {
      const MotionTag = React.forwardRef<HTMLElement, Record<string, unknown>>(
        ({ children, initial, animate, transition, ...props }, ref) =>
          React.createElement(tag as string, { ...props, ref }, children as React.ReactNode),
      );
      MotionTag.displayName = `motion.${String(tag)}`;
      return MotionTag;
    },
  }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── contexts ───────────────────────────────────────────────────────────────
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'test-user', email: 'test@example.com' },
    initializing: false,
  }),
}));

vi.mock('@/contexts/CreditsContext', () => ({
  useCredits: () => ({
    refreshCredits: vi.fn(),
    canAfford: () => true,
    getToolCost: () => 1,
  }),
}));

// ── TanStack Query ─────────────────────────────────────────────────────────
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: false, isError: false }),
}));

// ── hooks ──────────────────────────────────────────────────────────────────
const preflightMock = vi.hoisted(() => ({
  state: {
    checkCredits: vi.fn(),
    showInsufficientModal: false,
    dismissModal: vi.fn(),
    preflightResult: null as null | { estimatedCredits: number; currentBalance: number },
    checking: false,
  },
  options: 'not-called' as unknown,
}));
function resetPreflightMock() {
  preflightMock.options = 'not-called';
  preflightMock.state = {
    checkCredits: vi.fn(),
    showInsufficientModal: false,
    dismissModal: vi.fn(),
    preflightResult: null,
    checking: false,
  };
}
vi.mock('@/hooks/use-credit-preflight', () => ({
  useCreditPreflight: (options?: { redirectOnInsufficient?: boolean }) => {
    preflightMock.options = options;
    return preflightMock.state;
  },
}));

vi.mock('@/hooks/useAuthenticatedImage', () => ({
  useAuthenticatedImage: (url: string | null) => url,
}));

vi.mock('@/hooks/useStudioModels', () => ({
  useStudioModels: () => ({
    myModels: [],
    setMyModels: vi.fn(),
    localPendingModels: [],
    setLocalPendingModels: vi.fn(),
    myModelsLoading: false,
    myModelsSearch: '',
    setMyModelsSearch: vi.fn(),
    mergedMyModels: [],
    isMyModelsEmptyState: true,
    fetchMyModels: vi.fn(),
    handleDeleteUserModel: vi.fn(),
    handleRenameUserModel: vi.fn(),
  }),
}));

vi.mock('@/hooks/useStudioUpload', () => ({
  useStudioUpload: () => ({
    handleJewelryUpload: vi.fn(),
    handleModelUpload: vi.fn(),
    handleSelectLibraryModel: vi.fn(),
    isModelUploading: false,
  }),
}));

vi.mock('@/hooks/useStudioGeneration', () => ({
  useStudioGeneration: () => ({
    isGenerating: false,
    generationProgress: 0,
    generationStep: '',
    rotatingMsgIdx: 0,
    workflowId: null,
    resultImages: [],
    setResultImages: vi.fn(),
    generationError: null,
    regenerationCount: 0,
    setRegenerationCount: vi.fn(),
    feedbackOpen: false,
    setFeedbackOpen: vi.fn(),
    handleGenerate: vi.fn(),
    handleKeepBrowsing: vi.fn(),
    resumeGeneration: vi.fn(),
    resetGeneration: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/hooks/useStudioOnboarding', () => ({
  useStudioOnboarding: () => ({
    uploadGuideOpen: false,
    setUploadGuideOpen: vi.fn(),
    productShotGuideOpen: false,
    setProductShotGuideOpen: vi.fn(),
    handleUploadGuideClose: vi.fn(),
    handleProductShotGuideClose: vi.fn(),
    hasCheckedUploadGuide: { current: false },
    hasCheckedProductShotGuide: { current: false },
  }),
}));

// ── feature flags ──────────────────────────────────────────────────────────
// ── onboarding / API ───────────────────────────────────────────────────────

vi.mock('@/lib/assets-api', () => ({
  fetchUserAssets: vi.fn(),
  updateAssetMetadata: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/posthog-events', () => ({
  trackJewelryUploaded: vi.fn(),
}));

vi.mock('@/lib/studio-examples', () => ({
  CATEGORY_EXAMPLES: {},
  ACCEPTABLE_EXAMPLES: {},
  LABEL_NAMES: {},
}));

// ── sub-components ─────────────────────────────────────────────────────────
vi.mock('@/components/studio/StudioGeneratingStep', () => ({
  StudioGeneratingStep: () => <div data-testid="generating-step" />,
}));

vi.mock('@/components/studio/StudioResultsStep', () => ({
  StudioResultsStep: () => <div data-testid="results-step" />,
}));

vi.mock('@/components/studio/StudioModelStep', () => ({
  StudioModelStep: () => <div data-testid="model-step" />,
}));

vi.mock('@/components/studio/StudioVaultUploadStep', () => ({
  StudioVaultUploadStep: () => <div data-testid="alt-upload-step" />,
}));

vi.mock('@/components/studio/StudioUploadStep', () => ({
  StudioUploadStep: ({ currentStep }: { currentStep: string }) =>
    currentStep === 'upload' ? <div data-testid="upload-step">Upload Your Jewelry<span>Step 1</span></div> : null,
}));

vi.mock('@/components/studio/FeedbackModal', () => ({
  FeedbackModal: () => null,
}));

vi.mock('@/components/studio/UploadGuideModal', () => ({
  UploadGuideModal: () => null,
}));

vi.mock('@/components/studio/ModelGuideModal', () => ({
  ModelGuideModal: () => null,
}));

vi.mock('@/components/studio/ProductShotGuideModal', () => ({
  ProductShotGuideModal: () => null,
}));

vi.mock('@/components/studio/StudioTestMenu', () => ({
  StudioTestMenu: () => null,
}));

vi.mock('@/components/CreditPreflightModal', () => ({
  CreditPreflightModal: () => null,
}));

// ── helpers ────────────────────────────────────────────────────────────────
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  resetPreflightMock();
  sessionStorage.clear();
});

function renderStudio(path = '/studio/necklace') {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <HelmetProvider>
      <MemoryRouter
        initialEntries={[path]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/studio/:type" element={<UnifiedStudio />} />
          <Route path="/credits" element={<div>CREDITS PAGE MARKER</div>} />
        </Routes>
      </MemoryRouter>
      </HelmetProvider>,
    );
  });
  return container;
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('UnifiedStudio smoke tests', () => {
  it('renders Step 1 upload zone by default', () => {
    const c = renderStudio();
    expect(c.textContent).toContain('Upload Your Jewelry');
    expect(c.textContent).toContain('Step 1');
  });

  it('renders the step progress bar', () => {
    const c = renderStudio();
    // Step indicator has all three step labels
    expect(c.textContent).toContain('Upload');
    expect(c.textContent).toContain('Choose model');
    expect(c.textContent).toContain('Results');
  });

  it('does not crash for product-shot route', () => {
    const c = renderStudio('/studio/ring');
    expect(c.textContent).toContain('Upload Your Jewelry');
  });

  it('takes the shared door-in redirect rather than opting out of it', () => {
    // The redirect itself (navigate to /credits with the shortfall, and saving
    // the return path) moved into useCreditPreflight, where it is tested once
    // and applies to every paid workflow. It used to be an effect in this file,
    // which is precisely why CAD could not reuse it and grew a second,
    // divergent insufficient-credit flow.
    //
    // What still belongs to this page is the choice not to opt out. Passing
    // redirectOnInsufficient: false here would silently dead-end a blocked
    // user, and nothing else would catch it.
    renderStudio('/studio/necklace');
    expect(preflightMock.options).not.toBe('not-called');
    expect(preflightMock.options?.redirectOnInsufficient).not.toBe(false);
  });
});
