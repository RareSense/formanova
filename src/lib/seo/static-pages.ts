/**
 * Text for public tool pages, written once and used twice:
 * - by the React pages themselves;
 * - by the build (vite.config.ts) to write a plain-HTML copy of index.html per
 *   page (dist/<path>/index.html, served by nginx for that exact address), so
 *   search engines, AI crawlers and link previews that do not run JavaScript
 *   still read the title, description and explanation. React
 *   replaces that HTML as soon as it loads, so visitors see no difference.
 *
 * Pure data and string functions only: this file is imported by vite.config.ts
 * in Node, so it must not use the "@/" alias or any browser API.
 */

export interface Faq {
  q: string;
  a: string;
}

export interface StaticPage {
  /** Address without a trailing slash, e.g. "/tools". */
  path: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  /** Optional numbered steps. */
  howTo?: { heading: string; steps: string[] };
  faqs?: Faq[];
  links?: { href: string; label: string }[];
}

export const LINE_SHEET_FAQS: Faq[] = [
  {
    q: 'What is a jewelry line sheet?',
    a: 'A line sheet is the document a jewelry brand sends to boutiques and wholesale buyers. It shows each piece with a photo, style number (SKU), materials and prices, plus the brand’s contact details and order terms, so a buyer can choose and order.',
  },
  {
    q: 'What should a jewelry line sheet include?',
    a: 'A clear photo of each piece, its name and SKU, the metal, stones and size, the wholesale price and the suggested retail price. Add your brand name, collection, contact details and order terms such as minimum order, payment and delivery time.',
  },
  {
    q: 'Is this line sheet generator really free?',
    a: 'Yes. There is no signup, no watermark and no page limit. You can download the full PDF for as many pieces as you add.',
  },
  {
    q: 'Is my line sheet saved?',
    a: 'No. The PDF is made in your browser and is not saved anywhere. Closing this page clears it, so download your PDF before you leave. Like most websites, we record how people use this page so we can improve it.',
  },
];

export const LINE_SHEET_STEPS = [
  'Add your logo, brand name, collection and contact details.',
  'Add a photo of each piece, then its name, SKU, metal, stone, size and prices.',
  'Add your order terms: minimum order, payment and delivery.',
  'Check the preview and download the PDF.',
];

export const LINE_SHEET_PAGE: StaticPage = {
  path: '/tools/jewelry-line-sheet-generator',
  title: 'Free Jewelry Line Sheet Generator (PDF) | FormaNova',
  description: 'Make a professional jewelry line sheet for wholesale buyers in minutes. Add photos, SKUs and prices, then download a clean PDF. Free, no signup, no watermark.',
  h1: 'Jewelry Line Sheet Generator',
  intro: 'Make a professional line sheet for wholesale buyers. Free, no signup, no watermark.',
  howTo: { heading: 'How to make a jewelry line sheet', steps: LINE_SHEET_STEPS },
  faqs: LINE_SHEET_FAQS,
  links: [{ href: '/tools', label: 'Free tools for jewelers' }],
};

export const PHOTO_CHECK_FAQS: Faq[] = [
  {
    q: 'What are the Amazon image requirements for jewelry?',
    a: 'For the main image, Amazon asks for a pure white background (RGB 255, 255, 255), the piece filling about 85% of the frame, and at least 1000 pixels on the longest side so shoppers can zoom. Check the current rules in Seller Central, as Amazon updates them.',
  },
  {
    q: 'What size should jewelry photos be for Etsy and Shopify?',
    a: 'Etsy recommends at least 2000 pixels on each side, with a landscape or square first photo, and files under 1 MB upload most reliably. Shopify accepts up to 5000 x 5000 pixels and 20 MB, and recommends 2048 x 2048 squares.',
  },
  {
    q: 'Does the fix change my jewelry?',
    a: 'No. It only reframes the photo, adds white space and turns an off-white backdrop pure white, working inward from the edges. It stops at the outline of the piece, so the metal, stones and highlights stay exactly as photographed.',
  },
  {
    q: 'Does a passing check mean Amazon will approve my photo?',
    a: 'No. The checker measures size, shape, background and framing. Marketplaces also review things it cannot measure, such as props, text or watermarks, so treat it as a careful pre-check.',
  },
];

export const PHOTO_CHECK_STEPS = [
  'Choose where you sell: Amazon, Etsy or Shopify.',
  'Drop a photo of your jewelry.',
  'The ready version appears beside it: framed, sized and on a clean white background.',
  'Download it.',
];

export const PHOTO_CHECK_PAGE: StaticPage = {
  path: '/tools/amazon-image-checker',
  title: 'Free Amazon Image Checker for Jewelry Photos | FormaNova',
  description: 'Check a jewelry photo against Amazon, Etsy and Shopify image rules, then fix size, square framing and white background in one click. Free, no signup.',
  h1: 'Jewelry Photo Checker',
  intro: 'Framed, sized and on a clean white background for Amazon, Etsy or Shopify. Free, no signup.',
  howTo: { heading: 'How to check a jewelry photo', steps: PHOTO_CHECK_STEPS },
  faqs: PHOTO_CHECK_FAQS,
  links: [{ href: '/tools', label: 'Free tools for jewelers' }],
};

export const TOOLS_PAGE: StaticPage = {
  path: '/tools',
  title: 'Free Jewelry Business Tools | FormaNova',
  description: 'Free tools for jewelry brands and designers. No signup, no watermark. Start with the jewelry line sheet generator.',
  h1: 'Free tools for jewelers',
  intro: 'Free to use. No signup. No watermark.',
  links: [
    { href: '/tools/jewelry-line-sheet-generator', label: 'Jewelry Line Sheet Generator: turn your pieces, prices and terms into a PDF line sheet for wholesale buyers.' },
    { href: '/tools/amazon-image-checker', label: 'Jewelry Photo Checker: check a photo against Amazon, Etsy or Shopify rules and fix it in one click.' },
  ],
};

/** Pages that get a plain-HTML copy at build time. */
export const STATIC_PAGES: StaticPage[] = [TOOLS_PAGE, LINE_SHEET_PAGE, PHOTO_CHECK_PAGE];

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function replaceTag(html: string, pattern: RegExp, replacement: string): string {
  if (!pattern.test(html)) throw new Error(`static-pages: index.html is missing ${pattern}`);
  return html.replace(pattern, replacement);
}

/** The readable body: heading, intro, steps, questions and links. */
export function renderPageBody(page: StaticPage): string {
  const parts = [
    `<main style="max-width:720px;margin:0 auto;padding:48px 24px;font-family:Inter,Arial,sans-serif;color:#1a1a1a">`,
    `<h1>${escapeHtml(page.h1)}</h1>`,
    `<p>${escapeHtml(page.intro)}</p>`,
  ];
  if (page.howTo) {
    parts.push(`<h2>${escapeHtml(page.howTo.heading)}</h2><ol>${page.howTo.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`);
  }
  if (page.faqs?.length) {
    parts.push(`<h2>Questions</h2>${page.faqs.map((f) => `<h3>${escapeHtml(f.q)}</h3><p>${escapeHtml(f.a)}</p>`).join('')}`);
  }
  if (page.links?.length) {
    parts.push(`<ul>${page.links.map((l) => `<li><a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a></li>`).join('')}</ul>`);
  }
  parts.push('</main>');
  return parts.join('');
}

/**
 * Turns the built index.html into this page's copy: its own title, description,
 * canonical and social tags, and its readable text inside #root in place of the
 * home-page loading skeleton. Throws if index.html no longer has the expected
 * tags, so a template change fails the build loudly instead of shipping wrong
 * meta tags.
 */
export function renderStaticHtml(indexHtml: string, page: StaticPage, siteUrl: string): string {
  const url = `${siteUrl.replace(/\/+$/, '')}${page.path}`;
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  let html = indexHtml;
  html = replaceTag(html, /<title>[^<]*<\/title>/, `<title>${title}</title>`);
  html = replaceTag(html, /<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${description}" />`);
  html = replaceTag(html, /<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${title}" />`);
  html = replaceTag(html, /<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${description}" />`);
  html = replaceTag(html, /<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${url}" />`);
  html = replaceTag(html, /<meta name="twitter:title" content="[^"]*"\s*\/?>/, `<meta name="twitter:title" content="${title}" />`);
  html = replaceTag(html, /<meta name="twitter:description" content="[^"]*"\s*\/?>/, `<meta name="twitter:description" content="${description}" />`);
  html = html.replace(/<link rel="canonical"[^>]*>/g, '');
  html = html.replace('</head>', `<link rel="canonical" href="${url}" />\n</head>`);

  const start = html.indexOf('<div id="root">');
  const bodyEnd = html.lastIndexOf('</body>');
  const rootEnd = html.lastIndexOf('</div>', bodyEnd);
  if (start < 0 || bodyEnd < 0 || rootEnd < start) throw new Error('static-pages: index.html is missing <div id="root">');
  // #root is the last element in <body>; anything after it (module scripts) is kept.
  return `${html.slice(0, start)}<div id="root">${renderPageBody(page)}</div>${html.slice(rootEnd + '</div>'.length)}`;
}
