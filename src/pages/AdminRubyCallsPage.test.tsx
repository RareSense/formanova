import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const calls = vi.hoisted(() => ({ listRubyCalls: vi.fn(), recordingBlob: vi.fn() }));
vi.mock('@/lib/ruby-call/admin-calls', async (orig) => ({ ...(await orig<object>()), ...calls }));

import AdminRubyCallsPage from './AdminRubyCallsPage';
import type { RubyCallRow } from '@/lib/ruby-call/admin-calls';

const row = (over: Partial<RubyCallRow> = {}): RubyCallRow => ({
  workflowId: 'wf1',
  callSessionId: 'cs1',
  startedAt: '2026-11-04T06:50:00Z',
  savedAt: '2026-11-04T06:51:00Z',
  accountEmail: 'owner@aura.com',
  name: 'Usha',
  email: 'usha@aura.com',
  contact: 'WhatsApp +447700900123',
  durationSeconds: 68,
  outcome: 'No deal',
  recordingSha: 'f'.repeat(64),
  recording: { finalSha: 'f'.repeat(64), parts: [], mime: 'audio/webm' },
  uploads: 1,
  links: ['https://drive.google.com/x'],
  lead: { name: 'Usha', brand: 'Aura Jewels', pieces: '500 pieces' },
  quote: null,
  payment: null,
  turns: [
    { role: 'ruby', text: 'Hi, may I have your name?' },
    { role: 'client', text: '<b>Usha</b> <img src=x onerror=alert(1)>' },
  ],
  ...over,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminRubyCallsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.listRubyCalls.mockResolvedValue([
    row(),
    row({ workflowId: 'wf2', callSessionId: 'cs2', name: 'Sara', email: 'sara@brand.com', outcome: 'Deal', recordingSha: null, recording: null, lead: {} }),
  ]);
});

describe('Admin Ruby calls page', () => {
  it('lists every call with client, contact, length and outcome', async () => {
    renderPage();
    expect(await screen.findByText('Usha')).toBeInTheDocument();
    expect(screen.getByText('Sara')).toBeInTheDocument();
    expect(screen.getAllByText('1:08')).toHaveLength(2);
    expect(screen.getByText('Deal')).toBeInTheDocument();
    expect(screen.getByText('No deal')).toBeInTheDocument();
  });

  it('search narrows the list by name or email', async () => {
    renderPage();
    await screen.findByText('Usha');
    fireEvent.change(screen.getByLabelText('Search calls'), { target: { value: 'sara@' } });
    expect(screen.queryByText('Usha')).not.toBeInTheDocument();
    expect(screen.getByText('Sara')).toBeInTheDocument();
  });

  it('opens a call: lead, links and the transcript as plain text, never HTML', async () => {
    const { container } = renderPage();
    fireEvent.click(await screen.findByText('Usha'));
    expect(screen.getByText('Aura Jewels')).toBeInTheDocument();
    expect(screen.getByText('https://drive.google.com/x')).toBeInTheDocument();
    expect(screen.getByText('<b>Usha</b> <img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });

  it('plays the recording only when asked, fetched with the login token', async () => {
    const createObjectURL = vi.fn(() => 'blob:rec');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    calls.recordingBlob.mockResolvedValue(new Blob(['a'], { type: 'audio/webm' }));
    const { container } = renderPage();
    fireEvent.click(await screen.findByText('Usha'));
    expect(calls.recordingBlob).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Play recording' }));
    await waitFor(() => expect(container.querySelector('audio')).toHaveAttribute('src', 'blob:rec'));
    expect(calls.recordingBlob).toHaveBeenCalledWith({ finalSha: 'f'.repeat(64), parts: [], mime: 'audio/webm' });
  });

  it('says plainly when a call has no recording', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Sara'));
    expect(screen.getByText('No recording for this call.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play recording' })).not.toBeInTheDocument();
  });
});
