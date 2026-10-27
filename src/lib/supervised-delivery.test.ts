import { describe, it, expect } from 'vitest';

import { deliveredFiles } from './supervised-delivery';
import type { SupervisedRunDetail } from './supervised-runs-api';

const SHA = 'b'.repeat(64);
const SHA2 = 'c'.repeat(64);

function detail(delivery: unknown, downloadUrls: Record<string, string> = {}): SupervisedRunDetail {
  return {
    run: {},
    supervision: {
      phase: 'delivered', attempt: 1, attempt_started_at: null, last_error: null, last_error_at: null,
      decision: 'send_replacement', decided_by_email: null, decided_at: null, acknowledged_missing: null,
      delivery, events: [],
    },
    send_check: null, replacement_check: null, uploads: [], notes: [], download_urls: downloadUrls,
  };
}

describe('deliveredFiles', () => {
  it('reads a replacement from delivery.final by sha256, which is how the proxy serves uploads', () => {
    const ref = (sha: string) => ({ uri: `azure://agentic-artifacts/cad-uploads/wf/u1/x`, sha256: sha.toUpperCase(), type: 'x', bytes: 1 });
    expect(deliveredFiles(detail({ final: { glb_artifact: ref(SHA), threedm_artifact: ref(SHA2) } }))).toEqual({
      glb: `/api/artifacts/${SHA}`, threedm: `/api/artifacts/${SHA2}`,
    });
  });

  it('falls back to the verified uploads, as same-origin proxy paths', () => {
    expect(deliveredFiles(detail(null, { glb: `https://formanova.ai/api/artifacts/${SHA}` }))).toEqual({
      glb: `/api/artifacts/${SHA}`, threedm: null,
    });
  });

  it('returns nothing when the detail carries no files (an AI model sent as it was)', () => {
    expect(deliveredFiles(detail(null))).toEqual({ glb: null, threedm: null });
    expect(deliveredFiles(detail({ final: { glb_artifact: { uri: 'not-azure' } } }))).toEqual({ glb: null, threedm: null });
  });
});
