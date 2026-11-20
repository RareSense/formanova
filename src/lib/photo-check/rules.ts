/**
 * Marketplace photo rules, in one table so they are easy to update. Numbers
 * come from each marketplace's own help pages (checked 2026-11-21). Amazon's
 * official page could not be read automatically that day: its figures are the
 * ones Amazon sellers consistently quote and must be re-checked against Seller
 * Central before relying on them. These are pre-checks, never an approval.
 */

export type Marketplace = 'amazon' | 'etsy' | 'shopify';

export interface MarketRules {
  label: string;
  /** Where the rules come from, shown on the page. */
  source: string;
  checkedOn: string;
  /** Longest side below this cannot be used at all. */
  minLongSide: number;
  /** Width and height should both reach this (Etsy), or the longest side (Amazon zoom). */
  goodSide: number;
  goodSideApplies: 'longest' | 'both';
  /** Largest allowed width and height, and megapixels. */
  maxSide?: number;
  maxMegapixels?: number;
  maxFileBytes?: number;
  /** Files above this may fail to upload (warning, not a hard limit). */
  softMaxFileBytes?: number;
  /** Shape the fixed photo will have. */
  target: { width: number; height: number };
  /** Shape advice: 'square' required/expected, 'landscape-or-square' for Etsy, 'any'. */
  shape: 'square' | 'landscape-or-square' | 'any';
  /** Pure white background required (Amazon main image). */
  needsWhiteBackground: boolean;
  /** Product should fill at least this share of the frame (Amazon: 0.85). */
  minFill?: number;
  /** How large the fixed photo frames the piece: share of the frame's shorter side. */
  fixFill: number;
}

export const MARKET_RULES: Record<Marketplace, MarketRules> = {
  amazon: {
    label: 'Amazon',
    source: 'Amazon Seller Central product image requirements (as quoted by Amazon sellers; re-check on Seller Central)',
    checkedOn: '2026-11-21',
    minLongSide: 500,
    goodSide: 1000,
    goodSideApplies: 'longest',
    maxSide: 10000,
    target: { width: 2000, height: 2000 },
    shape: 'square',
    needsWhiteBackground: true,
    minFill: 0.85,
    fixFill: 0.87,
  },
  etsy: {
    label: 'Etsy',
    source: 'Etsy Help: Requirements and Best Practices for Images in Your Etsy Shop',
    checkedOn: '2026-11-21',
    minLongSide: 635,
    goodSide: 2000,
    goodSideApplies: 'both',
    softMaxFileBytes: 1024 * 1024,
    target: { width: 2667, height: 2000 },
    shape: 'landscape-or-square',
    needsWhiteBackground: false,
    fixFill: 0.8,
  },
  shopify: {
    label: 'Shopify',
    source: 'Shopify Help: product media types',
    checkedOn: '2026-11-21',
    minLongSide: 1,
    goodSide: 2048,
    goodSideApplies: 'longest',
    maxSide: 5000,
    maxMegapixels: 25,
    maxFileBytes: 20 * 1024 * 1024,
    target: { width: 2048, height: 2048 },
    shape: 'square',
    needsWhiteBackground: false,
    fixFill: 0.85,
  },
};

export const SOURCES: Record<Marketplace, string> = {
  amazon: 'https://sellercentral.amazon.com/help/hub/reference/external/G1881',
  etsy: 'https://help.etsy.com/hc/en-us/articles/115015663347',
  shopify: 'https://help.shopify.com/en/manual/products/product-media/product-media-types',
};
