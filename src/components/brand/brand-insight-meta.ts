import { Fingerprint, Globe2, Info, Link2, MapPin, Palette, Sparkles, Tag, Users, type LucideIcon } from 'lucide-react';
import { InstagramIcon } from '@/components/brand/social-icons';

/** Canonical display order for normalized storefront-scan findings. */
export const INSIGHT_DISPLAY_ORDER = [
  'identity',
  'palette',
  'productFocus',
  'visualStyle',
  'targetMarkets',
  'audience',
  'location',
  'website',
  'social',
  'otherInfo',
] as const;

export type InsightKey = (typeof INSIGHT_DISPLAY_ORDER)[number];
export type InsightFeedKey = InsightKey;

export const INSIGHT_META: Record<InsightFeedKey, { label: string; icon: LucideIcon }> = {
  identity: { label: 'Brand identity', icon: Fingerprint },
  palette: { label: 'Color palette', icon: Palette },
  productFocus: { label: 'Product focus', icon: Tag },
  visualStyle: { label: 'Visual style', icon: Sparkles },
  targetMarkets: { label: 'Target market', icon: Globe2 },
  audience: { label: 'Audience', icon: Users },
  location: { label: 'Location', icon: MapPin },
  website: { label: 'Website', icon: Link2 },
  social: { label: 'Social links', icon: InstagramIcon },
  otherInfo: { label: 'Other details', icon: Info },
};
