import { describe, it, expect } from 'vitest';
import { groupRingVersions } from './generation-history-utils';

const ring = {
  versions: [
    { asset_id: 'a1', position: 0, source_workflow_id: 'wf_1', thumbnail_url: 't1' },
    { asset_id: 'a2', position: 1, source_workflow_id: 'wf_2', thumbnail_url: 't2' },
    { asset_id: 'a3', position: 2, source_workflow_id: 'wf_3', thumbnail_url: null },
  ],
};

const rows = [
  { workflow_id: 'wf_3' },
  { workflow_id: 'wf_2' },
  { workflow_id: 'wf_1' },
  { workflow_id: 'wf_other' },
];

describe('groupRingVersions', () => {
  it('keeps only the newest run of a ring, carrying its versions', () => {
    const grouped = groupRingVersions(rows, [ring]);
    expect(grouped.map(r => r.workflow_id)).toEqual(['wf_3', 'wf_other']);
    expect(grouped[0].ring_versions?.map(v => v.assetId)).toEqual(['a1', 'a2', 'a3']);
  });

  it('leaves a run the vault never heard of exactly as it was', () => {
    const grouped = groupRingVersions(rows, [ring]);
    expect(grouped[1]).toEqual({ workflow_id: 'wf_other' });
  });

  it('adds no strip to a ring nobody has improved yet', () => {
    const single = { versions: [{ asset_id: 'a1', position: 0, source_workflow_id: 'wf_1' }] };
    const grouped = groupRingVersions([{ workflow_id: 'wf_1' }], [single]);
    expect(grouped).toEqual([{ workflow_id: 'wf_1' }]);
  });

  it('changes nothing when the vault is empty or unreachable', () => {
    expect(groupRingVersions(rows, [])).toEqual(rows);
  });

  it('ignores versions with no run of their own rather than dropping rows', () => {
    const odd = { versions: [{ asset_id: 'a1', position: 0 }, { asset_id: 'a2', position: 1 }] };
    expect(groupRingVersions(rows, [odd])).toEqual(rows);
  });
});
