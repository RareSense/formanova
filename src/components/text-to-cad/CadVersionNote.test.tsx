import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { CadVersionNote } from './CadVersionNote';

beforeEach(() => window.localStorage.clear());

describe('CadVersionNote', () => {
  it('opens by itself the first time a version with a note is shown', async () => {
    render(<CadVersionNote assetId="v1" text="Send sharper photos." />);
    expect(await screen.findByText('Send sharper photos.')).toBeTruthy();
    expect(window.localStorage.getItem('formanova_cad_note_seen:v1')).toBe('1');
  });

  it('stays closed for a version already seen, and opens on the lightbulb', async () => {
    window.localStorage.setItem('formanova_cad_note_seen:v1', '1');
    render(<CadVersionNote assetId="v1" text="Send sharper photos." />);
    expect(screen.queryByText('Send sharper photos.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Note on this model' }));
    expect(await screen.findByText('Send sharper photos.')).toBeTruthy();
  });

  it('shows the note as plain text with its line breaks, never as HTML', async () => {
    render(<CadVersionNote assetId="v2" text={'Line one\n<b>Line two</b>'} />);
    const note = await screen.findByText(/Line one/);
    expect(note.textContent).toBe('Line one\n<b>Line two</b>');
    expect(note.querySelector('b')).toBeNull();
    expect(note.className).toContain('whitespace-pre-wrap');
  });

  it('opens again for a different version with its own note', async () => {
    const view = render(<CadVersionNote assetId="v1" text="First." />);
    expect(await screen.findByText('First.')).toBeTruthy();
    view.rerender(<CadVersionNote assetId="v3" text="Second." />);
    expect(await screen.findByText('Second.')).toBeTruthy();
  });
});
