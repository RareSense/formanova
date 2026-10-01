import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import CadModelPicker from '@/components/text-to-cad/CadModelPicker';
import { DEFAULT_CAD_PICK } from '@/lib/cad-model-picker';

describe('CadModelPicker', () => {
  it('shows every model and provider as a toggle, with the current pick pressed', () => {
    render(<CadModelPicker value={DEFAULT_CAD_PICK} onChange={() => {}} />);
    for (const name of ['Gemini 4 Argon', 'Fable 5.1', 'Opus 5.5', 'GPT-6 Astra', 'Qwen 3.8 Max', 'Gemini 3.8 Flash', 'Direct', 'OpenRouter']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'GPT-6 Astra' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Direct' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Qwen 3.8 Max' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps Gemini 4 Argon selectable', () => {
    const onChange = vi.fn();
    render(<CadModelPicker value={DEFAULT_CAD_PICK} onChange={onChange} />);
    const argon = screen.getByRole('button', { name: 'Gemini 4 Argon' }) as HTMLButtonElement;
    expect(argon.disabled).toBe(false);
    fireEvent.click(argon);
    expect(onChange).toHaveBeenLastCalledWith({ model: 'gemini_4_argon', provider: 'direct' });
  });

  it('keeps the provider when the model changes and the model when the provider changes', () => {
    const onChange = vi.fn();
    render(<CadModelPicker value={DEFAULT_CAD_PICK} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Qwen 3.8 Max' }));
    expect(onChange).toHaveBeenLastCalledWith({ model: 'qwen_3_8_max', provider: 'direct' });
    fireEvent.click(screen.getByRole('button', { name: 'OpenRouter' }));
    expect(onChange).toHaveBeenLastCalledWith({ model: 'gpt_6_astra', provider: 'openrouter' });
  });

  it('locks while a run is starting', () => {
    render(<CadModelPicker value={DEFAULT_CAD_PICK} onChange={() => {}} disabled />);
    expect((screen.getByRole('button', { name: 'Opus 5.5' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'OpenRouter' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
