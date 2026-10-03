import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CadPhoneSheet } from './CadPhoneSheet';
import { sheetAfterDrag, sheetAfterTabPress } from './cad-sheet-snap';

const H = { peek: 56, half: 300, full: 544 };

describe('sheetAfterDrag', () => {
  it('settles on the nearest snap height', () => {
    expect(sheetAfterDrag('peek', 56 + 230, H)).toBe('half');
    expect(sheetAfterDrag('half', 520, H)).toBe('full');
    expect(sheetAfterDrag('full', 80, H)).toBe('peek');
  });

  it('a short deliberate flick still moves one step', () => {
    expect(sheetAfterDrag('peek', 56 + 50, H)).toBe('half');
    expect(sheetAfterDrag('half', 300 - 50, H)).toBe('peek');
    expect(sheetAfterDrag('half', 300 + 50, H)).toBe('full');
  });

  it('a tiny wobble stays where it was', () => {
    expect(sheetAfterDrag('half', 300 + 10, H)).toBe('half');
  });
});

describe('sheetAfterTabPress', () => {
  it('opens a peeking sheet at half height on the tab pressed', () => {
    expect(sheetAfterTabPress('peek', 'material', 'parts')).toEqual({ snap: 'half', tab: 'parts' });
  });
  it('switches tabs without moving an open sheet', () => {
    expect(sheetAfterTabPress('full', 'material', 'parts')).toEqual({ snap: 'full', tab: 'parts' });
  });
  it('pressing the open tab again lowers the sheet back to its tab bar', () => {
    expect(sheetAfterTabPress('half', 'parts', 'parts')).toEqual({ snap: 'peek', tab: 'parts' });
  });
});

describe('CadPhoneSheet', () => {
  const tabs = [
    { id: 'material', label: 'Material' },
    { id: 'parts', label: 'Parts' },
  ];

  it('renders a tab per entry and marks the open one', () => {
    render(
      <CadPhoneSheet tabs={tabs} activeTab="parts" snap="half" onChange={vi.fn()}>
        <p>content</p>
      </CadPhoneSheet>,
    );
    expect(screen.getByRole('tab', { name: 'Parts' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Material' }).getAttribute('aria-selected')).toBe('false');
    expect(screen.getByRole('tabpanel').textContent).toBe('content');
  });

  it('a tab press at peek opens the sheet on that tab', () => {
    const onChange = vi.fn();
    render(
      <CadPhoneSheet tabs={tabs} activeTab="material" snap="peek" onChange={onChange}>
        <p>content</p>
      </CadPhoneSheet>,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Parts' }));
    expect(onChange).toHaveBeenCalledWith({ snap: 'half', tab: 'parts' });
  });

  it('hides the content from assistive tech while only the tab bar peeks', () => {
    render(
      <CadPhoneSheet tabs={tabs} activeTab="material" snap="peek" onChange={vi.fn()}>
        <p>content</p>
      </CadPhoneSheet>,
    );
    expect(screen.queryByRole('tabpanel')).toBeNull();
  });

  it('the grip toggles between the tab bar and half height', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <CadPhoneSheet tabs={tabs} activeTab="material" snap="peek" onChange={onChange}>
        <p>content</p>
      </CadPhoneSheet>,
    );
    fireEvent.click(screen.getByRole('button', { name: /expand panel/i }));
    expect(onChange).toHaveBeenLastCalledWith({ snap: 'half', tab: 'material' });
    rerender(
      <CadPhoneSheet tabs={tabs} activeTab="material" snap="full" onChange={onChange}>
        <p>content</p>
      </CadPhoneSheet>,
    );
    fireEvent.click(screen.getByRole('button', { name: /collapse panel/i }));
    expect(onChange).toHaveBeenLastCalledWith({ snap: 'peek', tab: 'material' });
  });
});
