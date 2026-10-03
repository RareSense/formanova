import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import CadJewelryTypeCards from './CadJewelryTypeCards';

describe('CadJewelryTypeCards', () => {
  it('offers the five pieces in order as one radio group', () => {
    render(<CadJewelryTypeCards value="ring" onChange={() => {}} />);

    expect(screen.getByRole('radiogroup', { name: 'Jewelry type' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual(
      ['Ring', 'Necklace', 'Bracelet', 'Earring', 'Other'],
    );
  });

  it('marks only the chosen piece as selected', () => {
    render(<CadJewelryTypeCards value="necklace" onChange={() => {}} />);

    expect(screen.getByRole('radio', { name: 'Necklace' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Ring' })).toHaveAttribute('aria-checked', 'false');
  });

  it('reports the piece that was clicked', () => {
    const onChange = vi.fn();
    render(<CadJewelryTypeCards value="ring" onChange={onChange} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Bracelet' }));
    expect(onChange).toHaveBeenCalledWith('bracelet');
  });

  it('moves the choice with the arrow keys, wrapping at the ends', () => {
    const onChange = vi.fn();
    render(<CadJewelryTypeCards value="ring" onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('radio', { name: 'Ring' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('necklace');
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Ring' }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('other');
  });

  it('keeps only the chosen card in the tab order', () => {
    render(<CadJewelryTypeCards value="earring" onChange={() => {}} />);

    expect(screen.getByRole('radio', { name: 'Earring' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Ring' })).toHaveAttribute('tabindex', '-1');
  });

  it('explains what Other covers', () => {
    render(<CadJewelryTypeCards value="ring" onChange={() => {}} />);

    expect(screen.getByText('Brooches, tiaras, watches & more')).toBeInTheDocument();
  });

  it('connects the Other hint to its card for screen readers', () => {
    render(<CadJewelryTypeCards value="ring" onChange={() => {}} />);

    const id = screen.getByRole('radio', { name: 'Other' }).getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    expect(document.getElementById(id as string)?.textContent).toContain('Brooches');
    expect(screen.getByRole('radio', { name: 'Ring' }).getAttribute('aria-describedby')).toBeNull();
  });

  it('cannot be changed while a run is generating', () => {
    const onChange = vi.fn();
    render(<CadJewelryTypeCards value="ring" onChange={onChange} disabled />);

    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'Necklace' }));
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Ring' }), { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
  });
  it('starts with nothing chosen and the first card reachable by Tab', () => {
    render(<CadJewelryTypeCards value={null} onChange={() => {}} />);

    for (const radio of screen.getAllByRole('radio')) expect(radio).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: 'Ring' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Necklace' })).toHaveAttribute('tabindex', '-1');
  });

  it('shows the error under the cards and marks the group invalid', () => {
    render(<CadJewelryTypeCards value={null} onChange={() => {}} error="Pick one." />);

    expect(screen.getByRole('alert')).toHaveTextContent('Pick one.');
    expect(screen.getByRole('radiogroup', { name: 'Jewelry type' })).toHaveAttribute('aria-invalid', 'true');
  });
});
