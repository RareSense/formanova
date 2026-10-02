import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// The real library fetches; we only care that it gets MOUNTED, since that is
// what reports whether any history exists.
const mountSpy = vi.hoisted(() => vi.fn());
vi.mock('./CadHistoryLibrary', () => ({
  default: (props: { variant: string }) => {
    mountSpy(props.variant);
    return <div data-testid="cad-history-library" />;
  },
}));
vi.mock('@/hooks/use-estimated-cost', () => ({
  useEstimatedCost: () => ({ cost: 70, loading: false }),
}));

import ImagePromptScreen from './ImagePromptScreen';

function renderScreen(jewelryType: 'ring' | 'necklace' | 'bracelet' | 'earring' | 'other' = 'ring') {
  return render(
    <ImagePromptScreen
      model="gemini"
      tier="claude_opus_5_openrouter"
      prompt=""
      setPrompt={vi.fn()}
      jewelryType={jewelryType}
      setJewelryType={vi.fn()}
      isGenerating={false}
      onGenerate={vi.fn()}
      referenceImagePreviewUrls={[]}
      onAddReferenceImages={vi.fn()}
      onRemoveReferenceImage={vi.fn()}
      onReplaceReferenceImages={vi.fn()}
    />,
  );
}

describe('ImagePromptScreen', () => {
  it('mounts My Rings even before any history is known', () => {
    // Regression guard: gating this render on hasImageHistory deadlocks the
    // panel. The flag is only ever set by the library's own callback, so if it
    // does not mount, nothing fetches, nothing reports back, and My Rings can
    // never replace the examples no matter how many images are uploaded.
    mountSpy.mockClear();
    renderScreen();

    expect(mountSpy).toHaveBeenCalledWith('images');
    expect(screen.getByTestId('cad-history-library')).toBeTruthy();
  });

  it('shows the examples while there is no history', () => {
    renderScreen();
    expect(screen.getByText('Try an Example')).toBeTruthy();
  });

  it('asks what is being made first, as Step 1, with the picture cards', () => {
    renderScreen();

    expect(screen.getByText(/image to cad · step 1/i)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /what are you making\?/i })).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'Jewelry type' })).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('words the upload step for the chosen piece', () => {
    renderScreen('earring');

    expect(screen.getByRole('heading', { name: /upload your earring images/i })).toBeTruthy();
    expect(screen.getByText(/drop your earring images or sketches here/i)).toBeTruthy();
  });

  it('calls an Other piece a piece', () => {
    renderScreen('other');

    expect(screen.getByRole('heading', { name: /upload your piece images/i })).toBeTruthy();
  });

  it('asks for a description or the details that matter for the chosen piece', () => {
    renderScreen('bracelet');

    expect(screen.getByPlaceholderText(/add a description or any details, e\.g\. 17 cm length, 5 mm wide/i)).toBeTruthy();
  });

  it('shows examples for the chosen piece', () => {
    renderScreen('necklace');
    expect(screen.getByRole('button', { name: 'Use necklace example 1' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Use ring example 1' })).toBeNull();
  });
});
