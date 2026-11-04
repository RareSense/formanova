import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { ClientBadge } from './ClientBadge';
import { clientLabel } from '@/lib/admin-client-label';

describe('clientLabel', () => {
  it('names Rhino runs with their version', () => {
    expect(clientLabel('rhino', '0.6.2')).toBe('Rhino 0.6.2');
    expect(clientLabel('rhino', null)).toBe('Rhino');
  });

  it('is null for untagged and other clients', () => {
    expect(clientLabel(null, null)).toBeNull();
    expect(clientLabel(undefined, undefined)).toBeNull();
    expect(clientLabel('web', '1.0')).toBeNull();
  });
});

describe('ClientBadge', () => {
  it('renders only for rhino', () => {
    expect(render(<ClientBadge client="rhino" version="0.6.2" />).container.textContent).toBe('Rhino 0.6.2');
    expect(render(<ClientBadge client={null} version={null} />).container.innerHTML).toBe('');
  });
});
