import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';

import { findAlloy } from '@/lib/metal-weight/alloys';
import { NO_VOLUME_REASON } from '@/lib/metal-weight/source';
import { WeightTag } from './WeightTag';

describe('WeightTag', () => {
  it('shows the weight to 1 dp and the short metal, with the full figure on hover', () => {
    render(<WeightTag source={{ available: true, volumeMm3: 2192.4, from: 'version' }} alloy={findAlloy('au14y')!} />);
    const tag = screen.getByText('28.0 g · 14K');
    expect(tag.closest('[title]')).toHaveAttribute('title', '27.98 g · 17.99 dwt, 14K Yellow Gold');
  });

  it('uses the short label for non-gold metals', () => {
    render(<WeightTag source={{ available: true, volumeMm3: 1000, from: 'version' }} alloy={findAlloy('ag925')!} />);
    expect(screen.getByText('10.4 g · 925')).toBeInTheDocument();
  });

  it('renders nothing without a measured volume', () => {
    const { container } = render(<WeightTag source={{ available: false, reason: NO_VOLUME_REASON }} alloy={findAlloy('au14y')!} />);
    expect(container).toBeEmptyDOMElement();
  });
});
