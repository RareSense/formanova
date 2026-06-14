import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/azure-utils', () => ({
  azureUriToUrl: (uri: string) => uri.replace('azure://', 'https://cdn.example.com/'),
}));

import {
  derivePhotoshootProgress,
  extractPhotoshootResultImages,
  resolvePhotoshootWorkflowState,
} from './photoshoot-batch-parser';

describe('photoshoot-batch-parser', () => {
  it('extracts result images from mixed result keys', () => {
    const images = extractPhotoshootResultImages({
      output: [{ output_url: 'https://example.com/a.jpg' }],
      extra: [{ image_url: 'https://example.com/b.jpg' }],
    });

    expect(images).toEqual(['https://example.com/a.jpg', 'https://example.com/b.jpg']);
  });

  it('converts azure artifact urls to displayable urls', () => {
    const images = extractPhotoshootResultImages({
      output: [{ output_url: 'azure://container/path/file.png' }],
    });

    expect(images[0]).toContain('file.png');
  });

  it('derives workflow state and progress from status payloads', () => {
    expect(resolvePhotoshootWorkflowState({ runtime: { state: 'completed' } })).toBe('completed');
    expect(derivePhotoshootProgress({
      progress: { total_nodes: 4, completed_nodes: 2, visited: ['start_node', 'render_stage'] },
    })).toEqual({ progress: 65, step: 'render stage' });
  });
});
