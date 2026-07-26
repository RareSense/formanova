/**
 * Hardcoded stand-in for the Nova onboarding demo. The real voice-agent and
 * site-scanner integrations are wired later — for now this drives the
 * "watch your bespoke card build itself" moment with fixed sample data for
 * a fictional brand, "Creative Zava".
 */
export interface CreativeZavaDemo {
  descriptor: string;
  styleTags: string[];
  paletteSwatches: string[];
  productFocus: string;
  targetMarkets: string[];
  basedIn: string;
  socialLinks: string[];
  otherInfo: string;
}

export const CREATIVE_ZAVA_DEMO: CreativeZavaDemo = {
  descriptor: 'Contemporary fine jewelry for the modern minimalist.',
  styleTags: ['Minimalist', 'Modern', 'Everyday Luxury'],
  paletteSwatches: ['#D4AF7A', '#F7F2E9', '#7A2233', '#1B1710'],
  productFocus: 'Fine gold & diamond jewelry',
  targetMarkets: ['United States', 'UAE', 'United Kingdom'],
  basedIn: 'Los Angeles, USA',
  socialLinks: ['https://instagram.com/creativezava', 'https://tiktok.com/@creativezava'],
  otherInfo: 'Founded 2019 · Small-batch, handcrafted pieces',
};

/**
 * Order the card visibly builds itself in once the user hits Continue — one
 * key reveals every ~550ms so it reads as progress, not an instant dump.
 */
export const DEMO_REVEAL_ORDER = [
  'imagery',
  'palette',
  'descriptor',
  'styleTags',
  'productFocus',
  'targetMarkets',
  'basedIn',
  'social',
  'otherInfo',
] as const;

export type DemoRevealKey = (typeof DEMO_REVEAL_ORDER)[number];
