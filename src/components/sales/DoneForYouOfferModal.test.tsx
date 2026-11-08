import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const events = vi.hoisted(() => ({ trackDfyOffer: vi.fn() }));
vi.mock('@/lib/posthog-events', () => events);

import { DoneForYouOfferModal } from './DoneForYouOfferModal';
import { offerState } from '@/lib/dfy-offer';

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.search}</div>;
}

function renderModal() {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<DoneForYouOfferModal userId="u1" moment="dashboard" open onClose={vi.fn()} />} />
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

  it('says it in a few plain words (owner, 2026-11-08): our team makes your photos; talk to our AI', () => {
    renderModal();
    expect(screen.getByRole('heading', { name: 'Let our team make your photos' })).toBeInTheDocument();
    expect(screen.getByText('You made them yourself so far. We can make all of them for you.')).toBeInTheDocument();
    const call = screen.getByRole('button', { name: 'Talk to our AI' });
    expect(call.className).toContain('marta-button-filled'); // the site's primary button, theme aware
    expect(screen.getByRole('button', { name: 'No thanks' })).toBeInTheDocument();
    expect(events.trackDfyOffer).toHaveBeenCalledWith('shown', 'dashboard');
  });

  it('"Talk to our AI" opens the Ruby call on the pricing page and remembers the choice', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Talk to our AI' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/pricing?talk=ruby');
    expect(offerState('u1').choice).toBe('talk');
    expect(events.trackDfyOffer).toHaveBeenCalledWith('talk_clicked', 'dashboard');
  });

  it('"No thanks" says where to find it later, and remembers', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'No thanks' }));
    expect(screen.getByText("Okay! It's always on the Pricing page.")).toBeInTheDocument();
    expect(offerState('u1').choice).toBe('no');
    expect(events.trackDfyOffer).toHaveBeenCalledWith('declined', 'dashboard');
  });
});
