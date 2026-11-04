import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const calls = vi.hoisted(() => ({ listRubyCalls: vi.fn(), recordingBlob: vi.fn(), fileBlob: vi.fn() }));
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
  uploadList: [{ name: 'mood.png', purpose: 'references', sha: 'b'.repeat(64) }],
  links: ['https://drive.google.com/x'],
  lead: { name: 'Usha', email: 'usha@aura.com', brand: 'Aura Jewels', pieces: '50 pieces', resolution: '2K', notes: 'Wants Friday' },
  quote: null,
  payment: null,
  turns: [
    { role: 'ruby', text: 'Hi, may I have your name?', start_ms: 2000 },
    { role: 'client', text: '<b>Usha</b> <img src=x onerror=alert(1)>', start_ms: 65000 },
  ],
  ...over,
});

function renderPage(path = '/admin/ruby-calls') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AdminRubyCallsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
  calls.fileBlob.mockResolvedValue(new Blob(['img'], { type: 'image/png' }));
  calls.listRubyCalls.mockResolvedValue([
    row(),
    row({ workflowId: 'wf2', callSessionId: 'cs2', name: 'Sara', email: 'sara@brand.com', outcome: 'Deal', recordingSha: null, recording: null, lead: {}, uploadList: [], uploads: 0, links: [] }),
  ]);
});

describe('Admin Ruby calls page', () => {
  it('lists every call with client, contact, length and outcome', async () => {
    renderPage();
    expect(await screen.findByText('Usha')).toBeInTheDocument();
    expect(screen.getByText('Sara')).toBeInTheDocument();
    expect(screen.getAllByText('1:08')).toHaveLength(2);
    expect(screen.getByText('Deal')).toBeInTheDocument();
  });

  it('search narrows the list by name or email', async () => {
    renderPage();
    await screen.findByText('Usha');
    fireEvent.change(screen.getByLabelText('Search calls'), { target: { value: 'sara@' } });
    expect(screen.queryByText('Usha')).not.toBeInTheDocument();
    expect(screen.getByText('Sara')).toBeInTheDocument();
  });

  it('opens a call on its own view and goes back to the list', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Usha'));
    expect(screen.getByRole('heading', { name: 'Usha' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /all calls/i }));
    expect(screen.getByText('Sara')).toBeInTheDocument();
  });

  it('shows the transcript as a conversation, as plain text, never HTML', async () => {
    const { container } = renderPage('/admin/ruby-calls?call=wf1');
    const transcript = await screen.findByRole('list', { name: 'Transcript' });
    const items = within(transcript).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Ruby');
    expect(items[0]).toHaveTextContent('0:02');
    expect(items[1]).toHaveTextContent('Client');
    expect(items[1]).toHaveTextContent('1:05');
    expect(screen.getByText('<b>Usha</b> <img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('img[src="x"]')).toBeNull();
  });

  it('shows what the client submitted: the image itself, its purpose, and links that open', async () => {
    renderPage('/admin/ruby-calls?call=wf1');
    const submissions = await screen.findByRole('region', { name: 'Submissions' });
    await waitFor(() => expect(within(submissions).getByRole('img', { name: 'mood.png' })).toHaveAttribute('src', 'blob:x'));
    expect(calls.fileBlob).toHaveBeenCalledWith('b'.repeat(64));
    expect(within(submissions).getByText('Reference')).toBeInTheDocument();
    const link = within(submissions).getByRole('link', { name: 'https://drive.google.com/x' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('groups the brief into contact, project and specs', async () => {
    renderPage('/admin/ruby-calls?call=wf1');
    const brief = await screen.findByRole('region', { name: 'Brief' });
    expect(within(brief).getByText('Contact')).toBeInTheDocument();
    expect(within(brief).getByText('Project')).toBeInTheDocument();
    expect(within(brief).getByText('Specs')).toBeInTheDocument();
    expect(within(brief).getByText('Aura Jewels')).toBeInTheDocument();
    expect(within(brief).getByText('Wants Friday')).toBeInTheDocument();
  });

  it('plays the recording on request, with a download of the same file', async () => {
    calls.recordingBlob.mockResolvedValue(new Blob(['a'], { type: 'audio/webm' }));
    const { container } = renderPage('/admin/ruby-calls?call=wf1');
    fireEvent.click(await screen.findByRole('button', { name: 'Play recording' }));
    await waitFor(() => expect(container.querySelector('audio')).toHaveAttribute('src', 'blob:x'));
    const download = screen.getByRole('link', { name: /download/i });
    expect(download).toHaveAttribute('href', 'blob:x');
    expect(download.getAttribute('download')).toMatch(/^ruby-call-2026-11-04-usha\.webm$/);
  });

  it('says plainly when a call has no recording or no submissions', async () => {
    renderPage('/admin/ruby-calls?call=wf2');
    expect(await screen.findByText('No recording for this call.')).toBeInTheDocument();
    expect(screen.getByText('Nothing was uploaded or shared on this call.')).toBeInTheDocument();
  });
});
