import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { getPublicSiteUrl } from '@/lib/public-url';
import { TOOLS_PAGE } from '@/lib/seo/static-pages';

/**
 * Home of FormaNova's free tools (proposal section 5: "One home"). Each tool is
 * useful on its own, with no signup. Add a tool here when it ships.
 */
const FREE_TOOLS = [
  {
    href: '/tools/jewelry-line-sheet-generator',
    name: 'Jewelry Line Sheet Generator',
    description: 'Turn your pieces, prices and terms into a PDF line sheet for wholesale buyers.',
  },
  {
    href: '/tools/amazon-image-checker',
    name: 'Jewelry Photo Checker',
    description: 'Make a jewelry photo ready for Amazon, Etsy or Shopify, on clean white.',
  },
] as const;

const PAGE_URL = `${getPublicSiteUrl()}/tools`;

export default function ToolsIndex() {
  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <Helmet>
        <title>{TOOLS_PAGE.title}</title>
        <meta name="description" content={TOOLS_PAGE.description} />
        <link rel="canonical" href={PAGE_URL} />
      </Helmet>

      <div className="mx-auto max-w-7xl px-6 py-12 md:px-12 md:py-16">
        <div className="max-w-3xl">
        <header className="mb-10">
          <h1 className="font-display text-4xl uppercase tracking-wide md:text-5xl">{TOOLS_PAGE.h1}</h1>
          <p className="mt-3 font-body text-base text-muted-foreground">{TOOLS_PAGE.intro}</p>
        </header>

        <ul className="space-y-4">
          {FREE_TOOLS.map((tool) => (
            <li key={tool.href}>
              <Link
                to={tool.href}
                className="group flex items-center justify-between gap-6 border border-border bg-background p-6 transition-colors hover:border-foreground/40"
              >
                <span className="min-w-0">
                  <span className="block font-body text-lg font-semibold">{tool.name}</span>
                  <span className="mt-1 block font-body text-sm text-muted-foreground">{tool.description}</span>
                </span>
                <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
        </div>
      </div>
    </div>
  );
}
