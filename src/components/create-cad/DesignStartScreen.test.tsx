import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockToast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast: mockToast }));

import DesignStartScreen from './DesignStartScreen';
import { MAX_DESIGN_IMAGES } from '@/lib/design-image-api';

const okImage = () => ({ ok: true, status: 200, blob: async () => new Blob(['x'], { type: 'image/webp' }) });

beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} } as unknown as typeof ResizeObserver;
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${n++}`);
  URL.revokeObjectURL = vi.fn();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
});

beforeEach(() => {
  mockToast.error.mockReset();
  globalThis.fetch = vi.fn(async () => okImage()) as never;
});

function renderInspiration(onMake = vi.fn()) {
  render(<DesignStartScreen variant="inspiration" jewelryType="ring" setJewelryType={vi.fn()} busy={false} onMake={onMake} />);
  return { onMake };
}

const canvasPictures = () => screen.queryAllByRole('img', { name: /primary inspiration image|inspiration angle/i });

describe('DesignStartScreen inspiration examples', () => {
  it('clicking an example puts its picture on the canvas, like an upload', async () => {
    const { onMake } = renderInspiration();
    expect(canvasPictures()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Use the ladybug example' }));

    await waitFor(() => expect(canvasPictures()).toHaveLength(1));
    expect(mockToast.error).not.toHaveBeenCalled();

    // It is a real inspiration picture: Make my design sends it.
    fireEvent.click(screen.getByRole('button', { name: /make my design/i }));
    await waitFor(() => expect(onMake).toHaveBeenCalledTimes(1));
    const [file] = onMake.mock.calls[0][0].images as File[];
    expect(file.name).toBe('ladybug.webp');
    expect(file.type).toBe('image/webp');
  });

  it('adds each example clicked, in order', async () => {
    renderInspiration();
    fireEvent.click(screen.getByRole('button', { name: 'Use the flower example' }));
    await waitFor(() => expect(canvasPictures()).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Use the spider web example' }));
    await waitFor(() => expect(canvasPictures()).toHaveLength(2));
  });

  it('quick clicks never go over the limit', async () => {
    renderInspiration();
    for (const name of ['ladybug', 'flower', 'spider web']) {
      fireEvent.click(screen.getByRole('button', { name: `Use the ${name} example` }));
      await waitFor(() => expect(screen.getByRole('button', { name: `Use the ${name} example` })).not.toHaveAttribute('aria-busy', 'true'));
    }
    await waitFor(() => expect(canvasPictures()).toHaveLength(MAX_DESIGN_IMAGES - 1));
    // One slot left, two clicks before either picture has loaded.
    fireEvent.click(screen.getByRole('button', { name: 'Use the teddy bear example' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use the ladybug example' }));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith(expect.stringMatching(/up to 4 pictures/i)));
    expect(canvasPictures()).toHaveLength(MAX_DESIGN_IMAGES);
  });

  it('says why the examples are off once the limit is reached', async () => {
    renderInspiration();
    for (const name of ['ladybug', 'flower', 'spider web', 'teddy bear']) {
      fireEvent.click(screen.getByRole('button', { name: `Use the ${name} example` }));
      await waitFor(() => expect(screen.getByRole('button', { name: `Use the ${name} example` })).not.toHaveAttribute('aria-busy', 'true'));
    }
    await waitFor(() => expect(canvasPictures()).toHaveLength(MAX_DESIGN_IMAGES));

    const ladybug = screen.getByRole('button', { name: 'Use the ladybug example' });
    expect(ladybug).toBeDisabled();
    expect(screen.getByText(`You have ${MAX_DESIGN_IMAGES} pictures, the most you can use. Remove one to add an example.`)).toBeInTheDocument();

    // Removing one turns them back on.
    fireEvent.click(screen.getByRole('button', { name: 'Remove primary image' }));
    await waitFor(() => expect(ladybug).not.toBeDisabled());
    expect(screen.getByText(/choose one to load its picture/i)).toBeInTheDocument();
  });

  it('shows an error when the example picture cannot be loaded', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404, blob: async () => new Blob(['nope'], { type: 'text/html' }) })) as never;
    renderInspiration();

    fireEvent.click(screen.getByRole('button', { name: 'Use the teddy bear example' }));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith(expect.stringMatching(/couldn't load the teddy bear example/i)));
    expect(canvasPictures()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Use the teddy bear example' })).not.toBeDisabled();
  });

  it('shows an error when the request itself fails', async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as never;
    renderInspiration();

    fireEvent.click(screen.getByRole('button', { name: 'Use the flower example' }));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith(expect.stringMatching(/couldn't load the flower example/i)));
    expect(canvasPictures()).toHaveLength(0);
  });
});
