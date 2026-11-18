import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { generateBlockedReason, type GenerateBlockedState } from '@/lib/generate-blocked-reason';
import { StudioModelStep } from './StudioModelStep';

const ready: GenerateBlockedState = {
  isProductShot: false,
  jewelryImage: 'blob:jewelry',
  activeModelUrl: 'https://x/model.webp',
  preflightChecking: false,
  isModelUploading: false,
};

describe('generateBlockedReason', () => {
  it('says nothing when Generate is usable', () => {
    expect(generateBlockedReason(ready)).toBeNull();
  });

  it('model shot with no model: asks for a model', () => {
    expect(generateBlockedReason({ ...ready, activeModelUrl: null })).toBe('Choose or upload a model to continue');
  });

  it('product shot with no inspiration: asks for an inspiration, never a "model"', () => {
    const r = generateBlockedReason({ ...ready, isProductShot: true, activeModelUrl: null });
    expect(r).toBe('Choose or upload an inspiration to continue');
    expect(r).not.toMatch(/model/i);
  });

  it('no jewelry: points back to step 1 first, in both modes', () => {
    expect(generateBlockedReason({ ...ready, jewelryImage: null, activeModelUrl: null })).toBe('Go back and upload your jewelry first');
    expect(generateBlockedReason({ ...ready, isProductShot: true, jewelryImage: null })).toBe('Go back and upload your jewelry first');
  });

  it('stays quiet while the button already shows a spinner', () => {
    expect(generateBlockedReason({ ...ready, activeModelUrl: null, preflightChecking: true })).toBeNull();
    expect(generateBlockedReason({ ...ready, activeModelUrl: null, isModelUploading: true })).toBeNull();
  });
});

function renderStep(overrides: Partial<React.ComponentProps<typeof StudioModelStep>> = {}) {
  const props: React.ComponentProps<typeof StudioModelStep> = {
    step2Ref: React.createRef(),
    modelInputRef: React.createRef(),
    isProductShot: false,
    user: { id: 'u1' },
    activeModelUrl: null,
    resolvedActiveModelUrl: null,
    jewelryImage: 'blob:jewelry',
    preflightChecking: false,
    isModelUploading: false,
    customModelImage: null,
    selectedModel: null,
    isMyModelsEmptyState: true,
    myModelsSearch: '',
    mergedMyModels: [],
    activePresetCategories: [],
    formanovaCategory: '',
    activePresetLoading: false,
    activePresetError: false,
    activePresetEmpty: true,
    presetModelsForCategory: [],
    setModelGuideOpen: vi.fn(),
    setCurrentStep: vi.fn(),
    setSelectedModel: vi.fn(),
    setCustomModelImage: vi.fn(),
    setCustomModelFile: vi.fn(),
    setModelAssetId: vi.fn(),
    setMyModelsSearch: vi.fn(),
    setFormanovaCategory: vi.fn(),
    aspectRatio: '1:1',
    resolution: '1K' as React.ComponentProps<typeof StudioModelStep>['resolution'],
    generationCost: 10,
    onAspectRatioChange: vi.fn(),
    onResolutionChange: vi.fn(),
    handleModelUpload: vi.fn(),
    handleGenerate: vi.fn(),
    handleDeleteUserModel: vi.fn(),
    handleRenameUserModel: vi.fn(),
    handleSelectLibraryModel: vi.fn(),
    ...overrides,
  };
  render(<StudioModelStep {...props} />);
  return props;
}

const generateButtons = () => screen.getAllByRole('button', { name: /generate photoshoot/i });

describe('StudioModelStep: why Generate is greyed out', () => {
  it('model shot: both Generate buttons are disabled and point to the "choose a model" line', () => {
    renderStep();
    const buttons = generateButtons();
    expect(buttons).toHaveLength(2);
    for (const b of buttons) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
      const hint = document.getElementById(b.getAttribute('aria-describedby')!);
      expect(hint?.textContent).toBe('Choose or upload a model to continue');
    }
  });

  it('product shot: the line talks about an inspiration', () => {
    renderStep({ isProductShot: true });
    expect(screen.getAllByText('Choose or upload an inspiration to continue')).toHaveLength(2);
    expect(screen.queryByText(/upload a model/i)).toBeNull();
  });

  it('once a model is chosen: no line, and Generate works as before', () => {
    const props = renderStep({ activeModelUrl: 'https://x/m.webp', resolvedActiveModelUrl: 'https://x/m.webp' });
    expect(screen.queryByRole('status')).toBeNull();
    const [desktop] = generateButtons();
    expect((desktop as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(desktop);
    expect(props.handleGenerate).toHaveBeenCalledTimes(1);
  });

  it('while uploading the model: spinner label only, no extra line', () => {
    renderStep({ isModelUploading: true });
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getAllByText(/uploading/i).length).toBeGreaterThan(0);
  });
});
