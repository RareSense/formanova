import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RubyStage } from './RubyPanels';
import type { Panel } from '@/lib/ruby-call/panels';

const noop = {
  onClose: vi.fn(),
  onUpload: vi.fn(async () => []),
  onLink: vi.fn(),
  onLinkTyping: vi.fn(),
};

describe('RubyPanels', () => {
  it('shows the deal with its payment plan: Pay now on the deposit, Copy link per payment, Test link tag', () => {
    const deal: Panel = {
      id: 'p1',
      kind: 'deal',
      title: 'Your deal',
      rows: [['Images, 2K', '120', '$10', '$1,200']],
      total: '$1,200',
      url: 'https://x/pay/test/cs-1',
      simulated: true,
      installments: [
        { n: 1, label: 'Deposit before work starts', amountCents: 60000, amount: '$600', due: null, url: 'https://x/pay/test/cs-1' },
        { n: 2, label: 'Balance on delivery', amountCents: 60000, amount: '$600', due: 'On delivery', url: null },
      ],
    };
    render(<RubyStage panel={deal} {...noop} />);
    expect(screen.getByText('Test link')).toBeInTheDocument();
    expect(screen.getByText('Deposit before work starts')).toBeInTheDocument();
    expect(screen.getByText('On delivery')).toBeInTheDocument();
    const pay = screen.getAllByRole('link', { name: /pay now/i });
    expect(pay).toHaveLength(1);
    expect(pay[0]).toHaveAttribute('href', 'https://x/pay/test/cs-1');
    expect(screen.getByRole('button', { name: 'Copy link for payment 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy link for payment 2' })).not.toBeInTheDocument();
    expect(screen.getByText('Link sent by email when we deliver')).toBeInTheDocument();
  });

  it('shows the payment plan under a quote', () => {
    const quote: Panel = {
      id: 'p2',
      kind: 'table',
      title: 'Your quote',
      columns: ['Item', 'Qty', 'Per unit', 'Total'],
      rows: [['AI revision round on up to 120 images', '120', 'Bonus', 'Free']],
      total: '$1,200',
      schedule: [{ n: 1, label: 'Full payment before work starts', amountCents: 120000, amount: '$1,200', due: null }],
    };
    render(<RubyStage panel={quote} {...noop} />);
    expect(screen.getByText('Payment plan')).toBeInTheDocument();
    expect(screen.getByText('Full payment before work starts')).toBeInTheDocument();
    // Compact row: amount on the right, the other columns wrapped under the label.
    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByText('Qty 120 · Per unit Bonus')).toBeInTheDocument();
  });

  it('never uses a table (no sideways scrolling) and collapses long lists behind "N more items"', () => {
    const rows = Array.from({ length: 9 }, (_, i) => [`Line ${i + 1}`, String(i + 1), `$${i + 1}`]);
    const quote: Panel = { id: 'p3', kind: 'table', title: 'Long', columns: ['Item', 'Qty', 'Total'], rows, total: '$45' };
    const { container } = render(<RubyStage panel={quote} {...noop} />);
    expect(container.querySelector('table')).toBeNull();
    expect(container.querySelector('[class*="overflow-x"]')).toBeNull();
    expect(screen.getByText('Line 6')).toBeInTheDocument();
    expect(screen.queryByText('Line 7')).not.toBeInTheDocument();
    expect(screen.getByText('$45')).toBeInTheDocument(); // total stays pinned
    fireEvent.click(screen.getByRole('button', { name: '3 more items' }));
    expect(screen.getByText('Line 9')).toBeInTheDocument();
  });

  it('renders a What / Before / Now comparison compactly: Now on the right, Before under the label', () => {
    const panel: Panel = {
      id: 'p6',
      kind: 'table',
      title: 'What changed',
      columns: ['What', 'Before', 'Now'],
      rows: [
        ['Total for 500 images, 2K, rush', '$9,025.60', '$8,120'],
        ['Deposit', '$3,158', '$2,842'],
      ],
      delivery: 'Delivery: within 5 working days, usually faster',
    };
    const { container } = render(<RubyStage panel={panel} {...noop} />);
    expect(container.querySelector('table')).toBeNull();
    expect(screen.getByText('$8,120')).toBeInTheDocument();
    expect(screen.getByText('Before $9,025.60')).toBeInTheDocument();
    expect(screen.getByText('Delivery: within 5 working days, usually faster')).toBeInTheDocument();
  });

  it('compact mode shows fewer rows and no details', () => {
    const rows = Array.from({ length: 6 }, (_, i) => [`Line ${i + 1}`, String(i + 1), `$${i + 1}`]);
    const panel: Panel = { id: 'p4', kind: 'table', title: 'T', columns: ['Item', 'Qty', 'Total'], rows };
    render(<RubyStage panel={panel} compact {...noop} />);
    expect(screen.queryByText('Line 5')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Qty/)).not.toBeInTheDocument();
  });

  it('reports when it is on screen', () => {
    const onRendered = vi.fn();
    const panel: Panel = { id: 'p5', kind: 'list', title: 'L', items: ['a'] };
    render(<RubyStage panel={panel} {...noop} onRendered={onRendered} />);
    expect(onRendered).toHaveBeenCalledWith('p5');
  });
});
