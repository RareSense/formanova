import { fireEvent, render, screen } from '@testing-library/react';
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

function renderScreen(
  jewelryType: 'ring' | 'necklace' | 'bracelet' | 'earring' | 'other' | null = 'ring',
  { onGenerate = vi.fn(), previews = [] as string[] } = {},
) {
  return render(
    <ImagePromptScreen
      model="gemini"
      tier="claude_opus_5_openrouter"
      prompt=""
      setPrompt={vi.fn()}
      jewelryType={jewelryType}
      setJewelryType={vi.fn()}
      isGenerating={false}
      onGenerate={onGenerate}
      referenceImagePreviewUrls={previews}
      onAddReferenceImages={vi.fn()}
      onRemoveReferenceImage={vi.fn()}
      onReplaceReferenceImages={vi.fn()}
    />,
  );
}

describe('ImagePromptScreen', () => {
  it('names the chosen piece on the browse button', () => {
    renderScreen('bracelet');

    expect(screen.getByText('Browse bracelet files')).toBeTruthy();
    expect(screen.queryByText('Browse ring files')).toBeNull();
  });

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

  it('asks for the spec only in the prompt box, whatever the piece', () => {
    renderScreen('bracelet');

    expect(screen.getByPlaceholderText('Sizes, widths and stone sizes in mm')).toBeTruthy();
  });

  it('asks plainly for dimensions above the prompt box, marked optional, and labels the box with it', () => {
    renderScreen('ring');

    // The ask is a visible label, not placeholder text that disappears on the first keystroke.
    expect(screen.getByText('Provide dimensions')).toBeTruthy();
    expect(screen.getByText('(optional)')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: /provide dimensions/i })).toBeTruthy();
  });

  it('shows examples for the chosen piece', () => {
    renderScreen('necklace');
    expect(screen.getByRole('button', { name: 'Use necklace example 1' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Use ring example 1' })).toBeNull();
  });
  it('does not generate until a piece is chosen, and says so', () => {
    const onGenerate = vi.fn();
    renderScreen(null, { onGenerate, previews: ['blob:one'] });
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /generate cad/i }));

    expect(onGenerate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/choose what you are making/i);
  });

  it('generates once a piece is chosen', () => {
    const onGenerate = vi.fn();
    renderScreen('earring', { onGenerate, previews: ['blob:one'] });

    fireEvent.click(screen.getByRole('button', { name: /generate cad/i }));

    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('asks for a piece instead of showing examples while none is chosen', () => {
    renderScreen(null);

    expect(screen.getByText(/choose what you are making to see examples/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /example 1/i })).toBeNull();
  });
});
