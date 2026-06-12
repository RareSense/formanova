import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import MyShopifyStore from './MyShopifyStore';

const mockUseShopifyStatus = vi.hoisted(() => vi.fn());
const mockInvalidateShopifyStatus = vi.hoisted(() => vi.fn());

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_, tag: keyof JSX.IntrinsicElements) => {
      const MotionTag = React.forwardRef<HTMLElement, Record<string, unknown>>(
        ({ children, initial, animate, transition, variants, whileHover, whileTap, ...props }, ref) => (
          React.createElement(tag, { ...props, ref }, children as React.ReactNode)
        ),
      );
      MotionTag.displayName = `motion.${String(tag)}`;
      return MotionTag;
    },
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/hooks/useShopify', () => ({
  useShopifyStatus: () => mockUseShopifyStatus(),
  useInvalidateShopifyStatus: () => mockInvalidateShopifyStatus,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, initializing: false }),
}));

vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light' }),
}));

vi.mock('@/components/shopify/ShopifyConnectDialog', () => ({
  ShopifyConnectDialog: () => null,
}));

describe('MyShopifyStore', () => {
  it('shows the connect action even when the status request fails', () => {
    mockUseShopifyStatus.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(
      <MemoryRouter>
        <MyShopifyStore />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: /connect shopify/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
    expect(screen.getByText(/could not confirm your shopify connection right now/i)).toBeTruthy();
  });
});
