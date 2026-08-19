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

function renderScreen() {
  return render(
    <ImagePromptScreen
      model="gemini"
      tier="claude_opus_5_openrouter"
      prompt=""
      setPrompt={vi.fn()}
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
});
