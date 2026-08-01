import type { ComponentType } from 'react';
import { Globe, ShoppingBag, MoreHorizontal, Instagram as InstagramChannelIcon } from 'lucide-react';
import { FacebookChannelIcon, WhatsAppChannelIcon } from '@/components/brand/channel-icons';
import { extractHandle } from '@/components/brand/social-icons';
import { isValidHttpUrl, isValidHandle, INVALID_URL_MESSAGE } from '@/lib/brand-profile-api';

export type SalesChannel = 'website' | 'store' | 'instagram' | 'facebook' | 'whatsapp' | 'other';

/** Users often type "mybrand.com" — the backend rejects anything that isn't http(s). */
export function normalizeUrl(value: string): string {
  const v = value.trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/**
 * Priority order for the one-at-a-time channel cascade: we ask for the
 * highest-priority channel first, and only reveal the next one down if the
 * user says they don't have the current one. WhatsApp sits second-to-last on
 * purpose — it's the easiest channel for a seller to have, so asking early
 * would let it crowd out higher-value channels like Website.
 */
export const CASCADE_ORDER: SalesChannel[] = ['website', 'store', 'instagram', 'facebook', 'whatsapp', 'other'];

export const CHANNEL_META: Record<SalesChannel, { label: string; Icon: ComponentType<{ className?: string }> }> = {
  website: { label: 'Website', Icon: Globe },
  store: { label: 'Online store', Icon: ShoppingBag },
  instagram: { label: 'Instagram', Icon: InstagramChannelIcon },
  facebook: { label: 'Facebook', Icon: FacebookChannelIcon },
  whatsapp: { label: 'WhatsApp', Icon: WhatsAppChannelIcon },
  other: { label: 'Other', Icon: MoreHorizontal },
};

export const CHANNEL_DETAIL_COPY: Record<SalesChannel, { label: string; placeholder: string; helper?: string; skipLabel: string }> = {
  website: {
    label: 'Website link',
    placeholder: 'yourbrand.com',
    skipLabel: "I don't have a website",
  },
  store: {
    label: 'Online store link',
    placeholder: 'etsy.com/shop/yourbrand',
    helper: 'Examples: Shopify, Etsy, Amazon, WooCommerce, etc.',
    skipLabel: "I don't have an online store",
  },
  instagram: {
    label: 'Instagram link or handle',
    placeholder: 'instagram.com/yourbrand or @yourbrand',
    skipLabel: "I don't have Instagram",
  },
  facebook: {
    label: 'Facebook page link',
    placeholder: 'facebook.com/yourbrand or @yourbrand',
    skipLabel: "I don't have Facebook",
  },
  whatsapp: {
    label: 'WhatsApp number',
    placeholder: '+1 555 123 4567',
    skipLabel: "I don't have WhatsApp",
  },
  other: {
    label: 'Other link',
    placeholder: 'Link where customers can buy',
    skipLabel: "I don't have any of these",
  },
};

export function normalizeSalesChannelDetail(channel: SalesChannel, value: string): string {
  const raw = value.trim();
  if (!raw) return '';
  if (channel === 'instagram') {
    const handle = extractHandle(raw, 'instagram.com');
    if (isValidHandle(handle)) return `https://instagram.com/${handle}`;
  }
  if (channel === 'facebook') {
    const handle = extractHandle(raw, 'facebook.com');
    if (isValidHandle(handle)) return `https://facebook.com/${handle}`;
  }
  if (channel === 'whatsapp' && !/^https?:\/\//i.test(raw) && !/^[\w.-]+\.[A-Za-z]{2,}/.test(raw)) {
    const digits = raw.replace(/[^\d]/g, '');
    if (digits.length >= 7) return `https://wa.me/${digits}`;
  }
  return normalizeUrl(raw);
}

export function validateSalesChannelDetail(channel: SalesChannel, normalized: string): string | undefined {
  if (!normalized) return 'This field is required.';
  if (!isValidHttpUrl(normalized)) {
    return INVALID_URL_MESSAGE;
  }
  return undefined;
}
