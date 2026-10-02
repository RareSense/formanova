import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/use-estimated-cost', () => ({
  useEstimatedCost: () => ({ cost: 70, loading: false }),
}));

import InitialPromptScreen from './InitialPromptScreen';
import type { CadJewelryType } from '@/lib/ring-cad-nurbs-api';

function renderScreen(jewelryType: CadJewelryType = 'ring') {
  return render(
    <InitialPromptScreen
      model="gemini"
      tier="gpt_6_astra_openai"
      setModel={vi.fn()}
      prompt=""
      setPrompt={vi.fn()}
      jewelryType={jewelryType}
      setJewelryType={vi.fn()}
      isGenerating={false}
      onGenerate={vi.fn()}
    />,
  );
}

describe('InitialPromptScreen', () => {
  it('asks what is being made with the picture cards, not a dropdown', () => {
    renderScreen();

    expect(screen.getByRole('radiogroup', { name: 'Jewelry type' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('shows no material or model controls', () => {
    renderScreen();

    expect(screen.queryByText(/material/i)).toBeNull();
    expect(screen.queryByText(/provider/i)).toBeNull();
  });

  it('words the brief for the chosen piece', () => {
    renderScreen('necklace');

    expect(screen.getByText(/describe your necklace design/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/describe your necklace/i)).toBeInTheDocument();
    expect(screen.queryByText(/rings only/i)).toBeNull();
  });

  it('keeps the ring example in the placeholder for rings', () => {
    renderScreen('ring');

    expect(screen.getByPlaceholderText(/a rose ring with three blooming roses/i)).toBeInTheDocument();
  });
});
