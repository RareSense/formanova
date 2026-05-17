import { describe, expect, it } from 'vitest';
import { normalizeWorkflowUrl, resolveWorkflowPollingUrls } from './workflow-urls';

describe('normalizeWorkflowUrl', () => {
  it('prefixes backend-relative paths with /api', () => {
    expect(normalizeWorkflowUrl('/result/wf-1')).toBe('/api/result/wf-1');
    expect(normalizeWorkflowUrl('status/wf-1')).toBe('/api/status/wf-1');
  });

  it('leaves /api and absolute urls unchanged', () => {
    expect(normalizeWorkflowUrl('/api/result/wf-1')).toBe('/api/result/wf-1');
    expect(normalizeWorkflowUrl('http://localhost:8005/result/wf-1')).toBe('http://localhost:8005/result/wf-1');
  });
});

describe('resolveWorkflowPollingUrls', () => {
  it('uses backend-provided polling urls when present', () => {
    expect(resolveWorkflowPollingUrls({
      workflow_id: 'wf-1',
      status_url: '/status/wf-1',
      result_url: '/result/wf-1',
    })).toEqual({
      workflowId: 'wf-1',
      statusUrl: '/api/status/wf-1',
      resultUrl: '/api/result/wf-1',
    });
  });

  it('falls back to workflow_id when polling urls are missing', () => {
    expect(resolveWorkflowPollingUrls({ workflow_id: 'wf-2' })).toEqual({
      workflowId: 'wf-2',
      statusUrl: '/api/status/wf-2',
      resultUrl: '/api/result/wf-2',
    });
  });

  it('throws when workflow_id is missing', () => {
    expect(() => resolveWorkflowPollingUrls({})).toThrow('No workflow_id returned');
  });
});
