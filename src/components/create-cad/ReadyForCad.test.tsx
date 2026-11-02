import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ReadyForCad from './ReadyForCad';

describe('ReadyForCad', () => {
  it('shows the metal and weight step under the dimensions, before Create CAD', () => {
    render(
      <ReadyForCad
        approved={{ display: 'blob:design', file: new File(['x'], 'd.png') } as never}
        jewelryType="ring"
        dimensions=""
        onDimensions={vi.fn()}
        cost={70}
        costLoading={false}
        onGenerate={vi.fn()}
        generating={false}
        metalStep={<div data-testid="metal-step" />}
      />,
    );
    const step = screen.getByTestId('metal-step');
    const dimensions = screen.getByLabelText(/Dimensions/);
    const create = screen.getByRole('button', { name: /Create CAD/ });
    expect(dimensions.compareDocumentPosition(step) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(step.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
