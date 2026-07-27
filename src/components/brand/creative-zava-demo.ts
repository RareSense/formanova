import { Fingerprint, Palette, Tag, Sparkles, Globe2, Users, MapPin, Link2, Info, type LucideIcon } from 'lucide-react';
import { InstagramIcon } from '@/components/brand/social-icons';

/**
 * Hardcoded stand-in for the Nova onboarding demo. The real voice-agent and
 * site-scanner integrations are wired later — for now this drives the
 * "watch your bespoke card build itself" moment with fixed sample data for
 * a fictional brand, "Creative Zava". Shaped as a mutable draft so the user
 * can edit any finding once scanning completes.
 */
export interface CreativeZavaProfile {
  identity: string;
  palette: string[];
  productFocus: string;
  visualStyle: string[];
  targetMarkets: string[];
  audience: string;
  basedIn: string;
  socialLinks: string[];
  otherInfo: string;
}

export const CREATIVE_ZAVA_DEMO: CreativeZavaProfile = {
  identity: 'Contemporary fine jewelry for the modern minimalist.',
  palette: ['#D4AF7A', '#F7F2E9', '#7A2233', '#1B1710'],
  productFocus: 'Fine gold & diamond jewelry',
  visualStyle: ['Minimalist', 'Modern', 'Everyday Luxury'],
  targetMarkets: ['United States', 'UAE', 'United Kingdom'],
  audience: 'Women 25-45, gift shoppers',
  basedIn: 'Los Angeles, USA',
  socialLinks: ['https://instagram.com/creativezava', 'https://tiktok.com/@creativezava'],
  otherInfo: 'Founded 2019 · Small-batch, handcrafted pieces',
};

/**
 * Order the scanning screen reveals findings in — one every ~700ms so it
 * reads as live discovery, not an instant dump. The pendant photo is always
 * visible on the card from the first paint (matches the production
 * BrandDetails card) rather than being gated behind a reveal step.
 */
export const INSIGHT_REVEAL_ORDER = [
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

export type InsightKey = (typeof INSIGHT_REVEAL_ORDER)[number];
export type InsightFeedKey = InsightKey;

/** Back-face fields — discovering one of these briefly auto-flips the card. */
export const BACK_SIDE_KEYS: ReadonlySet<InsightKey> = new Set([
  'productFocus',
  'targetMarkets',
  'audience',
  'location',
  'website',
  'social',
  'otherInfo',
]);

/** Comma-joined array fields (e.g. target markets) edit as a comma-separated string. */
export const MULTI_VALUE_KEYS = new Set<InsightFeedKey>(['visualStyle', 'targetMarkets', 'social']);

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
