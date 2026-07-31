import { describe, it, expect, vi } from 'vitest';
import { extractPhotoThumbnail, extractCadTextData, extractProductShotThumbnail } from './generation-enrichment';

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

  it('falls back to a generic output scan when generate_jewelry_image step is missing', () => {
    // Upscale/fix workflows have no generate step but still carry a result
    // image in a step output — it must surface so history shows them.
    const steps = [{ tool: 'upscale_image', output: { image_b64: 'abc' } }];
    expect(extractPhotoThumbnail(steps)).toBe('data:image/jpeg;base64,abc');
  });

  it('returns null when no step output carries an image at all', () => {
    const steps = [{ tool: 'other_tool', output: { note: 'no image here' } }];
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

  it('resolves an azure:// output_url to a blob URL', () => {
    const steps = [{
      tool: 'generate_jewelry_image',
      output: { output_url: 'azure://container/image.jpg' },
    }];
    expect(extractPhotoThumbnail(steps)).toBe('https://cdn.example.com/container/image.jpg');
  });

  it('returns null for an unsupported url scheme', () => {
    const steps = [{
      tool: 'generate_jewelry_image',
      output: { output_url: 'ftp://container/image.jpg' },
    }];
    expect(extractPhotoThumbnail(steps)).toBeNull();
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

  it('does not mistake a non-glb azure reference on the generate step for the model URI', () => {
    // ring-generate's output can carry other azure:// refs (e.g. a reference image
    // used for generation) alongside/instead of the actual model. Only a real .glb
    // uri should ever be treated as glb_url.
    const steps = [
      {
        tool: 'ring-generate',
        output: {
          reference_image: { uri: 'azure://bucket/reference-input.jpg' },
        },
      },
    ];
    const result = extractCadTextData(steps);
    expect(result.glb_url).toBeNull();
  });

  it('finds the real glb even when the generate step also carries a non-glb azure reference', () => {
    const steps = [
      {
        tool: 'ring-generate',
        output: {
          reference_image: { uri: 'azure://bucket/reference-input.jpg' },
        },
      },
      {
        tool: 'run_blender',
        output: {
          success: true,
          glb_artifact: { uri: 'azure://bucket/model.glb' },
          screenshots: [],
        },
      },
    ];
    const result = extractCadTextData(steps);
    expect(result.glb_url).toBe('https://cdn.example.com/bucket/model.glb');
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

  it('prefers the generate step output over an input image CAS ref from an earlier prepare step', () => {
    // Regression for the prepare->generate CAS handoff change: prepare steps now emit
    // input images as {uri: "azure://..."} too, which must not be picked up as the thumbnail.
    const steps = [
      { tool: 'analyze_jewelry_pdp', output: { description: 'a gold ring' } },
      {
        tool: 'prepare_jewelry_request_pdp_higher_tier',
        output: { jewelry_images: [{ uri: 'azure://container/input/jewelry1.jpg', sha256: 'abc' }] },
      },
      {
        tool: 'generate_jewelry_image_pdp_higher_tier',
        output: { output_url: 'azure://container/output/real-result.jpg' },
      },
    ];

    expect(extractProductShotThumbnail(steps)).toBe('https://cdn.example.com/container/output/real-result.jpg');
  });
});
