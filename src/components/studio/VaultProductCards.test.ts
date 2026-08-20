import { describe, expect, it } from 'vitest';
import { buildVaultCards } from './VaultProductCards';
import type { UserAsset } from '@/lib/assets-api';

function asset(overrides: Partial<UserAsset> & { id: string }): UserAsset {
  return {
    asset_type: 'jewelry_photo',
    created_at: '2026-08-01T00:00:00Z',
    thumbnail_url: `/api/artifacts/${overrides.id}`,
    name: null,
    ...overrides,
  } as UserAsset;
}

describe('buildVaultCards', () => {
  it('groups assets sharing a set into one card and leaves ungrouped assets standalone', () => {
    const cards = buildVaultCards([
      asset({ id: 'a', set_ids: ['set-1'] }),
      asset({ id: 'b', set_ids: ['set-1'] }),
      asset({ id: 'c', set_ids: null }),
    ]);

    expect(cards).toHaveLength(2);
    expect(cards[0].groupId).toBe('set-1');
    expect(cards[0].members.map((m) => m.id)).toEqual(['a', 'b']);
    expect(cards[1].groupId).toBeNull();
    expect(cards[1].members.map((m) => m.id)).toEqual(['c']);
  });

  it('places an asset in every set it belongs to, not just the first', () => {
    // The whole point of the 2026-08-19 grouping consolidation: a reused image
    // used to vanish from every set but the one it was first uploaded into.
    const cards = buildVaultCards([
      asset({ id: 'shared', set_ids: ['set-1', 'set-2'] }),
      asset({ id: 'only-1', set_ids: ['set-1'] }),
      asset({ id: 'only-2', set_ids: ['set-2'] }),
    ]);

    expect(cards.map((c) => c.groupId)).toEqual(['set-1', 'set-2']);
    expect(cards[0].members.map((m) => m.id)).toEqual(['shared', 'only-1']);
    expect(cards[1].members.map((m) => m.id)).toEqual(['shared', 'only-2']);
  });

  it('falls back to input_group_id when set_ids is absent, for pre-consolidation responses', () => {
    const cards = buildVaultCards([
      asset({ id: 'a', input_group_id: 'grp-legacy' }),
      asset({ id: 'b', input_group_id: 'grp-legacy' }),
    ]);

    expect(cards).toHaveLength(1);
    expect(cards[0].groupId).toBe('grp-legacy');
    expect(cards[0].members.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('prefers set_ids over input_group_id when both are present', () => {
    // input_group_id reports only one set; set_ids is authoritative.
    const cards = buildVaultCards([
      asset({ id: 'a', input_group_id: 'set-1', set_ids: ['set-1', 'set-2'] }),
    ]);

    expect(cards.map((c) => c.groupId)).toEqual(['set-1', 'set-2']);
  });

  it('picks the earliest-created member as the cover of a multi-image set', () => {
    const cards = buildVaultCards([
      asset({ id: 'late', set_ids: ['set-1'], created_at: '2026-08-05T00:00:00Z' }),
      asset({ id: 'early', set_ids: ['set-1'], created_at: '2026-08-01T00:00:00Z' }),
    ]);

    expect(cards[0].cover.id).toBe('early');
  });

  it('treats an empty set_ids array as ungrouped rather than dropping the asset', () => {
    const cards = buildVaultCards([asset({ id: 'a', set_ids: [] })]);

    expect(cards).toHaveLength(1);
    expect(cards[0].groupId).toBeNull();
    expect(cards[0].members.map((m) => m.id)).toEqual(['a']);
  });
});
