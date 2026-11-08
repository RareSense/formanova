import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const events = vi.hoisted(() => ({ trackDfyOffer: vi.fn() }));
vi.mock('@/lib/posthog-events', () => events);

import { DoneForYouOfferModal } from './DoneForYouOfferModal';
import { offerChoice } from '@/lib/dfy-offer';

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.search}</div>;
}

function renderModal() {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<DoneForYouOfferModal userId="u1" open onClose={vi.fn()} />} />
        <Route path="/pricing" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DoneForYouOfferModal', () => {
  beforeEach(() => {
    localStorage.clear();
    events.trackDfyOffer.mockReset();
  });

  it('says it plainly: our team makes your whole collection, get your price from Ruby', () => {
    renderModal();
    expect(screen.getByRole('heading', { name: 'Want us to make your photos for you?' })).toBeInTheDocument();
    expect(screen.getByText(/Until now you have made your photoshoots yourself/)).toBeInTheDocument();
    expect(screen.getByText(/Our creative team can make your whole collection for you/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get my price' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No thanks' })).toBeInTheDocument();
    expect(events.trackDfyOffer).toHaveBeenCalledWith('shown');
  });

  it('"Get my price" opens the Ruby call on the pricing page and remembers the choice', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Get my price' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/pricing?talk=ruby');
    expect(offerChoice('u1')?.choice).toBe('talk');
    expect(events.trackDfyOffer).toHaveBeenCalledWith('talk_clicked');
  });

  it('"No thanks" says where to find it later, and remembers', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'No thanks' }));
    expect(screen.getByText('No problem. You can find this any time on the Pricing page.')).toBeInTheDocument();
    expect(offerChoice('u1')?.choice).toBe('no');
    expect(events.trackDfyOffer).toHaveBeenCalledWith('declined');
  });
});
