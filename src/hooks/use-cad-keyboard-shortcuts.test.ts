/**
 * The workspace pauses shortcuts while a sheet or drawer is open, so Backspace
 * typed (or Esc pressed) there never deletes or deselects parts behind it.
 */
import { fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useCADKeyboardShortcuts, type CADShortcutActions } from './use-cad-keyboard-shortcuts';

function actions(enabled: boolean): CADShortcutActions {
  return {
    onUndo: vi.fn(), onRedo: vi.fn(), onDelete: vi.fn(), onDuplicate: vi.fn(),
    onSelectAll: vi.fn(), onDeselectAll: vi.fn(), onSetTransformMode: vi.fn(),
    onToggleWireframe: vi.fn(), onToggleShortcutsPanel: vi.fn(), enabled,
  };
}

describe('useCADKeyboardShortcuts enabled', () => {
  it('acts on keys while enabled', () => {
    const a = actions(true);
    renderHook(() => useCADKeyboardShortcuts(a));
    fireEvent.keyDown(window, { key: 'Backspace' });
    fireEvent.keyDown(window, { key: 'g' });
    expect(a.onDelete).toHaveBeenCalledTimes(1);
    expect(a.onSetTransformMode).toHaveBeenCalledWith('translate');
  });

  it('ignores every key while paused, and resumes after', () => {
    const paused = actions(false);
    const { rerender } = renderHook((p: CADShortcutActions) => useCADKeyboardShortcuts(p), { initialProps: paused });
    fireEvent.keyDown(window, { key: 'Backspace' });
    fireEvent.keyDown(window, { key: 'Delete' });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'r' });
    expect(paused.onDelete).not.toHaveBeenCalled();
    expect(paused.onDeselectAll).not.toHaveBeenCalled();
    expect(paused.onSetTransformMode).not.toHaveBeenCalled();

    const live = { ...paused, enabled: true };
    rerender(live);
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(paused.onDelete).toHaveBeenCalledTimes(1);
  });
});
