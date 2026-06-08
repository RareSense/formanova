import { describe, it, expect, vi } from 'vitest';
import {
  extractDescriptionFromSteps,
  extractPhotoThumbnail,
  extractCadTextData,
  extractProductShotThumbnail,
} from './generation-enrichment';

// Mock azure-utils so tests don't need real Azure URIs
vi.mock('./azure-utils', () => ({
  azureUriToUrl: (uri: string) => uri.replace('azure://', 'https://cdn.example.com/'),
}));

// Mock authenticated-fetch - intercepted for both static and dynamic imports
const mockAuthFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/authenticated-fetch', () => ({ authenticatedFetch: mockAuthFetch }));

// ── extractPhotoThumbnail ────────────────────────────────────────────

describe('extractPhotoThumbnail', () => {
  it('returns null for empty steps', () => {
    expect(extractPhotoThumbnail([])).toBeNull();
  });

  it('returns null when generate_jewelry_image step is missing', () => {
    const steps = [{ tool: 'other_tool', output: { image_b64: 'abc' } }];
    expect(extractPhotoThumbnail(steps)).toBeNull();
  });

  it('extracts base64 from image_b64', () => {
    const steps = [{
      tool: 'generate_jewelry_image',
      output: { image_b64: 'abc123', mime_type: 'image/png' },
    }];
    expect(extractPhotoThumbnail(steps)).toBe('data:image/png;base64,abc123');
  });

  it('defaults to image/jpeg when mime_type is absent', () => {
    const steps = [{
      tool: 'generate_jewelry_image',
      output: { image_b64: 'abc123' },
    }];
    expect(extractPhotoThumbnail(steps)).toBe('data:image/jpeg;base64,abc123');
  });

  it('extracts base64 from nested result.image_b64', () => {
    const steps = [{
      tool: 'generate_jewelry_image',
      output: { result: { image_b64: 'nested123', mime_type: 'image/webp' } },
    }];
    expect(extractPhotoThumbnail(steps)).toBe('data:image/webp;base64,nested123');
  });

  it('falls back to output_url when no base64', () => {
    const steps = [{
      tool: 'generate_jewelry_image',
      output: { output_url: 'https://example.com/image.jpg' },
    }];
    expect(extractPhotoThumbnail(steps)).toBe('https://example.com/image.jpg');
  });

  it('converts azure output_url values', () => {
    const steps = [{
      tool: 'generate_jewelry_image',
      output: { output_url: 'azure://container/image.jpg' },
    }];
    expect(extractPhotoThumbnail(steps)).toBe('https://cdn.example.com/container/image.jpg');
  });
});

// ── extractCadTextData ───────────────────────────────────────────────

describe('extractCadTextData', () => {
  it('returns empty data for empty steps', () => {
    const result = extractCadTextData([]);
    expect(result.thumbnail_url).toBe('');
    expect(result.screenshots).toEqual([]);
    expect(result.glb_url).toBeNull();
    expect(result.glb_filename).toBeNull();
    expect(result.ai_model).toBeNull();
  });

  it('extracts screenshots and glb from run_blender step', () => {
    const steps = [{
      tool: 'run_blender',
      output: {
        success: true,
        glb_artifact: { uri: 'azure://bucket/model.glb' },
        screenshots: [
          { uri: 'azure://bucket/shot1.png' },
          { uri: 'azure://bucket/shot2.png' },
        ],
      },
    }];
    const result = extractCadTextData(steps);
    expect(result.glb_url).toBe('https://cdn.example.com/bucket/model.glb');
    expect(result.glb_filename).toBe('model.glb');
    expect(result.screenshots).toHaveLength(2);
    expect(result.screenshots[0].url).toBe('https://cdn.example.com/bucket/shot1.png');
    expect(result.thumbnail_url).toBe('https://cdn.example.com/bucket/shot1.png');
  });

  it('ignores run_blender step when success is false (no screenshots, but GLB fallback still finds it)', () => {
    const steps = [{
      tool: 'run_blender',
      output: {
        success: false,
        glb_artifact: { uri: 'azure://bucket/model.glb' },
        screenshots: [{ uri: 'azure://bucket/shot1.png' }],
      },
    }];
    const result = extractCadTextData(steps);
    // Screenshots are not extracted from a failed blender step
    expect(result.screenshots).toEqual([]);
    // GLB fallback scan still finds the uri in the output
    expect(result.glb_url).toBe('https://cdn.example.com/bucket/model.glb');
  });

  it('extracts ai_model from step input', () => {
    const steps = [
      { tool: 'generate', input: { model: 'claude-opus' }, output: {} },
    ];
    const result = extractCadTextData(steps);
    expect(result.ai_model).toBe('claude-opus');
  });

  it('thumbnail_url is empty string when no screenshots found', () => {
    const result = extractCadTextData([{ tool: 'other', input: {}, output: {} }]);
    expect(result.thumbnail_url).toBe('');
  });
});

// -- extractProductShotThumbnail - step-based (sync) --

describe('extractProductShotThumbnail', () => {
  it('returns an http output_url from step output', () => {
    const steps = [{ output: { output_url: 'https://cdn.example.com/img.jpg' } }];
    expect(extractProductShotThumbnail(steps)).toBe('https://cdn.example.com/img.jpg');
  });

  it('converts azure:// URIs to https', () => {
    const steps = [{ output: { output_url: 'azure://container/path/img.jpg' } }];
    const result = extractProductShotThumbnail(steps);
    expect(result).toBeTruthy();
    expect(result).not.toContain('azure://');
  });

  it('returns null for empty steps', () => {
    expect(extractProductShotThumbnail([])).toBeNull();
  });

  it('returns null when steps have no image fields', () => {
    const steps = [{ output: { some_other_field: 'value' } }];
    expect(extractProductShotThumbnail(steps)).toBeNull();
  });

  it('extracts nested output_image objects from product-shot results', () => {
    const steps = [{
      output_data: {
        result: {
          output_image: {
            uri: 'azure://container/path/nested.png',
          },
        },
      },
    }];

    expect(extractProductShotThumbnail(steps)).toBe('https://cdn.example.com/container/path/nested.png');
  });

  it('extracts nested image_b64 payloads recursively', () => {
    const steps = [{
      output_data: {
        nodes: [
          {
            result: {
              image_b64: 'recursive123',
              mime_type: 'image/png',
            },
          },
        ],
      },
    }];

    expect(extractProductShotThumbnail(steps)).toBe('data:image/png;base64,recursive123');
  });
});

describe('extractDescriptionFromSteps', () => {
  it('extracts description from a product-shot describe node', () => {
    const steps = [
      {
        tool: 'describe',
        output_data: {
          description: 'Gold pendant necklace on white background',
        },
      },
    ];

    expect(extractDescriptionFromSteps(steps)).toBe('Gold pendant necklace on white background');
  });

  it('extracts nested description from describe output data', () => {
    const steps = [
      {
        tool: 'describe',
        output_data: {
          data: {
            result: {
              description: 'Silver ring with a solitaire stone',
            },
          },
        },
      },
    ];

    expect(extractDescriptionFromSteps(steps)).toBe('Silver ring with a solitaire stone');
  });

  it('prioritizes describe node over later generated node descriptions', () => {
    const steps = [
      {
        tool: 'generate',
        output_data: {
          description: 'Generated scene description',
        },
      },
      {
        tool: 'describe_jewelry',
        output_data: {
          jewelry_description: 'Original jewelry description',
        },
      },
    ];

    expect(extractDescriptionFromSteps(steps)).toBe('Original jewelry description');
  });
});
