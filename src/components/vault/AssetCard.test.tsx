import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/hooks/useAuthenticatedImage', () => ({
  useAuthenticatedImage: () => 'blob:mock-thumbnail',
}));

import { AssetCard } from './AssetCard';
import type { UserAsset } from '@/lib/assets-api';

function makeAsset(overrides: Partial<UserAsset> = {}): UserAsset {
  return {
    id: 'asset-1',
    asset_type: 'generated_photo',
    created_at: '2026-07-04T00:00:00Z',
    thumbnail_url: '/artifacts/thumb.webp',
    name: 'Photoshoot 1',
    ...overrides,
  };
}

describe('AssetCard resolution badge (Step 7)', () => {
  it('renders the image_size as a badge when present', () => {
    render(<AssetCard asset={makeAsset({ metadata: { image_size: '2K' } })} />);
    // getByText throws if the badge is missing, so this asserts presence.
    expect(screen.getByText('2K')).toBeTruthy();
  });

  it('renders no badge and does not crash when metadata is absent (old assets/uploads)', () => {
    const { container } = render(<AssetCard asset={makeAsset({ metadata: undefined })} />);
    expect(screen.queryByText(/^\d+K$/)).toBeNull();
    expect(container).toBeTruthy();
  });

  it('renders no badge when image_size is blank', () => {
    render(<AssetCard asset={makeAsset({ metadata: { image_size: '  ' } })} />);
    expect(screen.queryByText(/K/)).toBeNull();
  });
});
