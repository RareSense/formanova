import { describe, expect, it } from 'vitest';
import {
  buildCadEditStartBody,
  buildCadGenerationStartBody,
  CAD_EDIT_RETURN_NODES,
  CAD_GENERATION_RETURN_NODES,
} from './cad-workflows';

describe('CAD workflow request bodies', () => {
  it('uses the backend return nodes for ring generation', () => {
    expect(CAD_GENERATION_RETURN_NODES).toEqual([
      'generate_initial',
      'build_initial',
      'build_retry',
      'validate_output',
      'build_corrected',
    ]);
  });

  it('uses the backend return nodes for ring edits', () => {
    expect(CAD_EDIT_RETURN_NODES).toEqual([
      'load_state',
      'edit_code_initial',
      'build_initial',
      'edit_code_fix',
      'build_retry',
    ]);
  });

  it('builds the ring generation start body with tier pricing context', () => {
    expect(buildCadGenerationStartBody('  rose ring  ', 'gemini')).toEqual({
      payload: {
        tier: 'standard',
        prompt: 'rose ring',
        max_attempts: 3,
        skip_validation: false,
      },
      return_nodes: [...CAD_GENERATION_RETURN_NODES],
    });
  });

  it('does not put auth or state callback fields in the ring generation payload', () => {
    const body = buildCadGenerationStartBody('rose ring', 'gemini');
    expect(body.payload).not.toHaveProperty('backend_api_key');
    expect(body.payload).not.toHaveProperty('state_backend_url');
    expect(body.payload).not.toHaveProperty('state_backend_bearer_token');
    expect(body.payload).not.toHaveProperty('state_on_behalf_of');
  });

  it('builds the ring edit start body without tenant API key or OBO fields', () => {
    const body = buildCadEditStartBody(' add flowers ', 'json-source-123', 'gemini');

    expect(body).toEqual({
      payload: {
        tier: 'standard',
        max_attempts: 3,
        description: 'add flowers',
        ring_id: 'json-source-123',
        source_workflow_id: 'json-source-123',
      },
      return_nodes: [...CAD_EDIT_RETURN_NODES],
    });
    expect(body.payload).not.toHaveProperty('backend_api_key');
    expect(body.payload).not.toHaveProperty('state_on_behalf_of');
    expect(body.payload).not.toHaveProperty('state_backend_url');
  });

  it('does not put auth or OBO fields in the ring edit payload when extra args are passed', () => {
    const body = buildCadEditStartBody(' add gems ', 'json-source-456', null);
    expect(body.payload).not.toHaveProperty('state_backend_bearer_token');
    expect(body.payload).not.toHaveProperty('state_on_behalf_of');
    expect(body.payload).not.toHaveProperty('backend_api_key');
  });

  it('omits state_backend_url when VITE_PIPELINE_API_URL is a relative path', () => {
    // import.meta.env.VITE_PIPELINE_API_URL is '' in test env
    const body = buildCadEditStartBody('desc', 'json-source-789', null);
    expect(body.payload).not.toHaveProperty('state_backend_url');
  });
});
