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
  { onGenerate = vi.fn(), previews = [] as string[], onEditFirst = undefined as (() => void) | undefined, editApproved = false } = {},
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
      onEditFirst={onEditFirst}
      editApproved={editApproved}
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

  it('shows an example of the sizes for the chosen piece in the box', () => {
    renderScreen('bracelet');

    expect(screen.getByPlaceholderText(/17 cm inner length/)).toBeTruthy();
  });

  it('asks plainly for dimensions above the prompt box, marked optional, and labels the box with it', () => {
    renderScreen('ring');

    // The ask is a visible label, not placeholder text that disappears on the first keystroke.
    expect(screen.getByText('(optional)')).toBeTruthy();
    expect(screen.getByText(/leave empty for standard proportions/i)).toBeTruthy();
    expect(screen.getByRole('textbox', { name: /dimensions/i })).toBeTruthy();
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

  it('shows ring examples until another piece is chosen, and loads only the picture', () => {
    renderScreen(null);

    expect(screen.queryByText(/choose what you are making to see examples/i)).toBeNull();
    expect(screen.getByText(/choose one to load its picture/i)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /ring example/i }).length).toBeGreaterThan(0);
  });

  describe('use as is / edit before CAD', () => {
    it('is not offered unless the page supports editing, so the plain flow is unchanged', () => {
      renderScreen('ring', { previews: ['blob:one'] });
      expect(screen.queryByRole('radiogroup', { name: /how should we use this design/i })).toBeNull();
      expect(screen.getByRole('textbox', { name: /dimensions/i })).toBeTruthy();
    });

    it('appears only once a picture is uploaded', () => {
      renderScreen('ring', { onEditFirst: vi.fn() });
      expect(screen.queryByRole('radiogroup', { name: /how should we use this design/i })).toBeNull();
    });

    it('starts on Use as is, with dimensions and Generate CAD as today', () => {
      const onGenerate = vi.fn();
      renderScreen('ring', { onGenerate, onEditFirst: vi.fn(), previews: ['blob:one'] });
      expect(screen.getByRole('radio', { name: /use as is/i }).getAttribute('aria-checked')).toBe('true');
      expect(screen.getByRole('textbox', { name: /dimensions/i })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /generate cad/i }));
      expect(onGenerate).toHaveBeenCalledTimes(1);
    });

    it('hides dimensions in edit mode and opens the editor instead of generating', () => {
      const onGenerate = vi.fn();
      const onEditFirst = vi.fn();
      renderScreen('ring', { onGenerate, onEditFirst, previews: ['blob:one'] });
      fireEvent.click(screen.getByRole('radio', { name: /edit before cad/i }));
      expect(screen.queryByRole('textbox', { name: /dimensions/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /generate cad/i })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /edit design/i }));
      expect(onEditFirst).toHaveBeenCalledTimes(1);
      expect(onGenerate).not.toHaveBeenCalled();
    });

    it('brings dimensions back when switching back to Use as is', () => {
      renderScreen('ring', { onEditFirst: vi.fn(), previews: ['blob:one'] });
      fireEvent.click(screen.getByRole('radio', { name: /edit before cad/i }));
      fireEvent.click(screen.getByRole('radio', { name: /use as is/i }));
      expect(screen.getByRole('textbox', { name: /dimensions/i })).toBeTruthy();
    });
  
    it('does not ask again once an edited design is approved, and offers Edit again', () => {
      const onEditFirst = vi.fn();
      renderScreen('ring', { onEditFirst, previews: ['blob:one'], editApproved: true });
      expect(screen.queryByRole('radiogroup', { name: /how should we use this design/i })).toBeNull();
      expect(screen.getByText(/edited design approved/i)).toBeTruthy();
      expect(screen.getByRole('textbox', { name: /dimensions/i })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /edit again/i }));
      expect(onEditFirst).toHaveBeenCalledTimes(1);
    });

    it('asks what is being made before opening the editor', () => {
      const onEditFirst = vi.fn();
      renderScreen(null, { onEditFirst, previews: ['blob:one'] });
      fireEvent.click(screen.getByRole('radio', { name: /edit before cad/i }));
      fireEvent.click(screen.getByRole('button', { name: /edit design/i }));
      expect(onEditFirst).not.toHaveBeenCalled();
      expect(screen.getByRole('alert').textContent).toMatch(/choose what you are making/i);
    });
  });
});
