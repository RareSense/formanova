import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/hooks/use-estimated-cost', () => ({
  useEstimatedCost: () => ({ cost: 70, loading: false }),
}));

import InitialPromptScreen from './InitialPromptScreen';
import type { CadJewelryType } from '@/lib/ring-cad-nurbs-api';

function renderScreen(jewelryType: CadJewelryType | null = 'ring', onGenerate = vi.fn(), modelPicker?: React.ReactNode) {
  return render(
    <InitialPromptScreen
      model="gemini"
      tier="gpt_6_astra_openai"
      setModel={vi.fn()}
      prompt="A rose ring"
      setPrompt={vi.fn()}
      jewelryType={jewelryType}
      setJewelryType={vi.fn()}
      isGenerating={false}
      onGenerate={onGenerate}
      modelPicker={modelPicker}
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

  it('offers briefs for the chosen piece', () => {
    renderScreen('earring');
    expect(screen.getByText('Small polished gold hoop earrings')).toBeTruthy();
    expect(screen.queryByText('Sculptural flowing gold band')).toBeNull();
  });
  it('does not generate until a piece is chosen, and says so', () => {
    const onGenerate = vi.fn();
    renderScreen(null, onGenerate);
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /generate cad/i }));

    expect(onGenerate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/choose what you are making/i);
  });

  it('generates once a piece is chosen', () => {
    const onGenerate = vi.fn();
    renderScreen('necklace', onGenerate);

    fireEvent.click(screen.getByRole('button', { name: /generate cad/i }));

    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('shows the admin model picker only when one is passed', () => {
    const { unmount } = renderScreen('ring', vi.fn(), <div data-testid="cad-model-picker" />);
    expect(screen.getByTestId('cad-model-picker')).toBeInTheDocument();
    unmount();
    renderScreen('ring');
    expect(screen.queryByTestId('cad-model-picker')).toBeNull();
  });
});
