import React, { lazy, Suspense } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { ArrowRight, Play } from 'lucide-react';
import { ScrollRevealSection, StaggerContainer } from '@/components/ScrollRevealSection';
import { KineticText } from '@/components/KineticText';
import { CinematicHero } from '@/components/CinematicHero';
import { ShopifyBagIcon } from '@/components/shopify/ShopifyBagIcon';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';

// Lazy-load heavy below-fold component (452 lines + multiple image imports)
const CinematicShowcase = lazy(() => import('@/components/CinematicShowcase').then(m => ({ default: m.CinematicShowcase })));

// Assets
import { ThemeLogo } from '@/components/ThemeLogo';
import rareSenseLogo from '@/assets/rare-sense-logo.webp';
const heroDiamondChoker = '/hero-diamond-choker.webp';
import heroVneckNecklace from '@/assets/jewelry/hero-vneck-necklace.webp';
import heroChokerBack from '@/assets/jewelry/hero-choker-back.webp';
import heroHandDiamonds from '@/assets/jewelry/hero-hand-diamonds.webp';
import heroBlueBracelets from '@/assets/jewelry/hero-blue-bracelets.webp';
import heroGoldPendant from '@/assets/jewelry/hero-gold-pendant.webp';
import heroEmeraldEarrings from '@/assets/jewelry/hero-emerald-earrings.webp';
import heroGemstoneRings from '@/assets/jewelry/hero-gemstone-rings.webp';
import heroAquamarineRings from '@/assets/jewelry/hero-aquamarine-rings.webp';
import heroDiamondBracelets from '@/assets/jewelry/hero-diamond-bracelets.webp';
import rhinoEarrings from '@/assets/home/rhino-chandelier-earrings.webp';

// Partnerships shown in the footer. Each links to its press release on the
// public (Astro) site, the same way the footer's About link does.
const PARTNERS = [
  { name: "Women's Jewelry Association", detail: 'New York · May 2026', href: 'https://formanova.ai/press/wja-partnership/' },
  { name: 'Dubai Jewellery Group', detail: 'Dubai · July 2026', href: 'https://formanova.ai/press/djg-partnership/' },
];

// CAD section. Jewelers doubt that "AI CAD" is real NURBS (many tools sell an STL),
// so the section offers the file itself. Rows and headings are the CAD page's own
// comparison wording. The .3dm is the one the CAD page serves; its contents (58
// closed solids, no meshes, millimeters, METAL and GEMS layers) were checked with
// rhino3dm on 2026-11-07. Update the caption if that file is ever replaced.
const CAD_SAMPLE_URL = 'https://formanova.ai/images/cad/models/formanova-chandelier-earrings.3dm';
const CAD_COMPARE = [
  { label: 'Geometry', ours: 'NURBS surfaces and solids', mesh: 'Triangle mesh' },
  { label: 'Editing in Rhino', ours: 'Edit surfaces and control points', mesh: 'Remodel from scratch' },
  { label: 'Parts', ours: 'Separate, named objects on layers', mesh: 'One fused shell' },
  { label: 'For the caster', ours: 'STEP and STL per part', mesh: 'One STL' },
];

export default function Welcome() {
  const navigate = useNavigate();
  const { user } = useAuth();

  if (user) return <Navigate to="/studio" replace />;

  // Web Vitals tracking — landing page only
  useEffect(() => {
    import('@/lib/web-vitals').then(({ initWebVitals }) => initWebVitals());
  }, []);

  const heroImages = [
    { src: heroDiamondChoker, alt: 'Diamond choker necklace' },
    { src: heroVneckNecklace, alt: 'V-neck diamond necklace' },
    { src: heroChokerBack, alt: 'Diamond choker from back' },
    { src: heroHandDiamonds, alt: 'Diamond hand jewelry' },
    { src: heroBlueBracelets, alt: 'Blue gemstone bracelets' },
    { src: heroGoldPendant, alt: 'Gold pendant necklace' },
    { src: heroEmeraldEarrings, alt: 'Emerald crystal earrings' },
    { src: heroGemstoneRings, alt: 'Colorful gemstone rings' },
    { src: heroAquamarineRings, alt: 'Aquamarine rings on hands' },
    { src: heroDiamondBracelets, alt: 'Diamond bracelets and rings' },
  ];

  // If signed in, go straight to studio. Otherwise, prompt to sign in.
  const handleStart = () => {
    if (user) {
      navigate('/studio');
    } else {
      navigate('/login');
    }
  };

  const features = [
    { title: 'Zero Alterations', description: 'Your jewelry stays exactly as in reality. No AI hallucinations. No subtle changes.' },
    { title: 'Verified Accuracy', description: 'See precision metrics that verify your jewelry is preserved perfectly.' },
    { title: 'Realistic Imagery', description: 'Get stunning photoshoot imagery with lifelike models ready in seconds.' },
  ];


  return (
    <>
      <Helmet>
        <title>FormaNova | AI Jewelry Photoshoot Studio & CAD Generator</title>
        <meta name="description" content="AI jewelry photoshoot studio & CAD generator. Upload product images for professional model photos, or generate 3D jewelry models from text. Packs from $2." />
        <link rel="canonical" href="/" />
      </Helmet>
    <div className="min-h-screen bg-background overflow-x-hidden scroll-smooth">
      {/* Hero Section with Cinematic 3D Parallax */}
      <section className="min-h-screen relative overflow-hidden bg-background">
        <CinematicHero images={heroImages} className="absolute inset-0" />
        
        {/* Gradient overlay - theme neutral */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-black/80 z-10" />
        
        {/* Content */}
        <div className="relative z-20 marta-container min-h-screen flex flex-col justify-center py-24 lg:py-32">
          <div className="max-w-2xl">
            {/* Eyebrow row: brand line + inline Works-with-Shopify lockup,
                divided by a hairline. Typographic treatment - part of the type
                system, no floating badge shapes. */}
            {/* lg:w-max lets the single line extend past the text column into the
                photo's empty space; below lg it stacks and the divider hides so
                it can never dangle orphaned at a line end. */}
            <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-2 lg:w-max lg:flex-nowrap">
              <span className="marta-label text-white text-base tracking-[0.3em] uppercase font-medium">
                {/* Non-breaking space keeps "& Designers" together when the line wraps on phones. */}
                For Jewelry Brands &{'\u00A0'}Designers
              </span>
              <span aria-hidden="true" className="hidden h-4 w-px bg-white/40 lg:block" />
              <span className="flex items-center gap-2 text-white/85 text-base tracking-[0.3em] uppercase font-medium">
                <ShopifyBagIcon className="h-4 w-4 shrink-0" />
                Works with <span className="font-bold text-white">Shopify</span>
              </span>
            </div>

            <div className="mb-8">
              {/* One h1 for the page; each word keeps its own line. The {' '}
                  spaces keep the text "Your Jewelry Unchanged" for search
                  engines and screen readers, and don't render between blocks. */}
              <h1>
                <span className="block marta-headline text-white leading-[0.85]">Your</span>{' '}
                <span className="block marta-headline text-white leading-[0.85]">Jewelry</span>{' '}
                <span className="block marta-headline hero-accent-text leading-[0.85]">Unchanged</span>
              </h1>
            </div>

            <p className="marta-body text-white/90 max-w-md mb-12 leading-relaxed">
              AI imagery you can trust. No hallucinations. No subtle changes. Ever. 
              Your jewelry accurately shown.
            </p>

            {/* Two equal columns so both buttons are the same size; stacked full
                width on phones, as Start Creating was before. */}
            <div className="grid gap-4 sm:w-max sm:grid-cols-2">
              <button onClick={handleStart} className="marta-button-hero magnetic-button">
                <span>Start Creating</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <Link to="/pricing" className="marta-button-hero-ghost magnetic-button">
                See pricing
              </Link>
            </div>
          </div>
        </div>
      </section>


      {/* Features Section */}
      <section className="marta-section content-deferred">
        <div className="marta-container">
          <ScrollRevealSection animation="fade-up" className="mb-16 md:mb-24">
            <span className="marta-label mb-6 block">Why FormaNova</span>
            <h2 className="marta-headline-sm">
              <KineticText animation="wave">AI Photography You Can Actually Trust</KineticText>
            </h2>
          </ScrollRevealSection>

          <StaggerContainer className="grid md:grid-cols-3 border-t border-l border-border/20" staggerDelay={150}>
            {features.map((feature, index) => (
              <div key={index} className="marta-block border-r border-b border-border/20 relative overflow-hidden">
                <div className="relative z-10">
                  <h3 className="font-display text-2xl md:text-3xl mb-4">{feature.title}</h3>
                  <p className="marta-body text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            ))}
          </StaggerContainer>

          {/* Cinematic Video Showcase — lazy-loaded (heavy, below fold) */}
          <ScrollRevealSection animation="fade-up" delay={300} className="mt-16 md:mt-24">
            <Suspense fallback={<div className="h-96 bg-muted/20 rounded-lg animate-pulse" />}>
              <CinematicShowcase />
            </Suspense>
          </ScrollRevealSection>
        </div>
      </section>

      {/* CAD Section */}
      <section aria-labelledby="home-cad-title" className="marta-section content-deferred">
        <div className="marta-container">
          <ScrollRevealSection animation="fade-up" className="mb-12 md:mb-16">
            <span className="marta-label mb-6 block">From design to photoshoot</span>
            {/* KineticText splits the words into letters, so screen readers get the plain line instead. */}
            <h2 id="home-cad-title" className="marta-headline-sm">
              <span className="sr-only">AI CAD You Can Actually Edit</span>
              <span aria-hidden="true">
                <KineticText animation="wave">AI CAD You Can Actually Edit</KineticText>
              </span>
            </h2>
            <p className="marta-body text-muted-foreground max-w-xl mt-6">
              Not designed yet? Describe a piece or upload a photo. In 30 to 40 minutes you get a native
              Rhino .3dm: real NURBS, not an STL in disguise. Every part its own named object, in millimeters.
            </p>
          </ScrollRevealSection>

          {/* Side by side only from xl: at lg the table column is too narrow and cells run to 5 lines. */}
          <div className="grid gap-12 xl:grid-cols-5 xl:items-start xl:gap-16">
            <figure className="xl:col-span-3">
              <img
                src={rhinoEarrings}
                alt="Rhino 8, NURBS wireframe: chandelier earrings .3dm in four viewports with METAL and GEMS layers"
                width={1904}
                height={929}
                loading="lazy"
                decoding="async"
                className="w-full h-auto border border-border/20"
              />
              <figcaption className="marta-label mt-4 leading-relaxed">
                This pair: 58 separate solids, zero meshes. Rhino 8, in millimeters.
              </figcaption>
            </figure>

            <div className="xl:col-span-2">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border/20">
                    <th scope="col"><span className="sr-only">Property</span></th>
                    <th scope="col" className="marta-label pb-3 pr-4 font-medium">FormaNova .3dm</th>
                    <th scope="col" className="marta-label pb-3 font-medium">A mesh from a 3D generator</th>
                  </tr>
                </thead>
                <tbody>
                  {CAD_COMPARE.map((row) => (
                    <tr key={row.label} className="border-b border-border/20 align-top">
                      <th scope="row" className="marta-label py-4 pr-4 font-medium">{row.label}</th>
                      <td className="marta-body py-4 pr-4 text-foreground">{row.ours}</td>
                      <td className="marta-body py-4 text-muted-foreground">{row.mesh}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* The file is the proof: a mesh can't pass this check in Rhino. */}
              <div className="mt-10">
                <a href={CAD_SAMPLE_URL} download className="marta-button-filled text-center">
                  Download the .3dm
                </a>
                <p className="marta-body text-muted-foreground mt-4">
                  The earrings above, 2.1 MB. Open it in Rhino and check it yourself.
                </p>
                {/* Public (Astro) page, so a plain link, not a router link. */}
                <a href="https://formanova.ai/ai-jewelry-cad/" className="marta-label marta-link hover:text-foreground mt-6 inline-flex items-center gap-2">
                  See how CAD works <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section. A shorter bottom so the Partnerships band follows closely (owner, 2026-11-07). */}
      <section className="marta-section pb-16 md:pb-20 lg:pb-24 content-deferred">
        <ScrollRevealSection animation="zoom" className="marta-container text-center">
          <div className="max-w-4xl mx-auto">
            <span className="marta-label mb-12 block">Start Now</span>
            <h2 className="marta-headline mb-8">
              <KineticText animation="split">Ready To Create?</KineticText>
            </h2>
            <p className="marta-body text-muted-foreground max-w-lg mx-auto mb-12">
              Design it in CAD, show it in photoshoots, with your jewelry perfectly preserved.
            </p>
            <button onClick={handleStart} className="marta-button-filled magnetic-button">
              <span>Start Creating</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </ScrollRevealSection>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/20 content-deferred">
        {/* A compact band, not a full page section: two partner names and one line need less room than a hero. */}
        <div className="py-12 md:py-16 lg:py-20 border-b border-border/20">
          <div className="marta-container text-center">
            <span className="marta-label">Partnerships</span>
            {/* Each partner links to our dated press release about it. */}
            <div className="flex flex-wrap items-start justify-center gap-8 md:gap-16 mt-8 mb-12">
              {PARTNERS.map((partner) => (
                <a
                  key={partner.name}
                  href={partner.href}
                  className="group flex flex-col items-center gap-3 text-center"
                >
                  <span className="font-display text-2xl md:text-3xl text-foreground/50 group-hover:text-foreground/70 transition-colors duration-300">
                    {partner.name}
                  </span>
                  <span className="marta-label">{partner.detail}</span>
                </a>
              ))}
            </div>
            <p className="font-display text-3xl md:text-4xl">
              Trusted by <span className="hero-accent-text">4,000+</span> Jewelers
            </p>
          </div>
        </div>
        
        <div className="marta-container py-8">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
            <ThemeLogo className="h-8" />
            {/* Photoshoots, CAD and About are pages on the public (Astro) site, so
                they are plain links, not router links. */}
            <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4 lg:flex-nowrap lg:gap-x-8">
              <a href="https://formanova.ai/ai-jewelry-photoshoot/" className="marta-label marta-link hover:text-foreground">Photoshoots</a>
              <a href="https://formanova.ai/ai-jewelry-cad/" className="marta-label marta-link hover:text-foreground">CAD</a>
              <a href="https://formanova.ai/about/" className="marta-label marta-link hover:text-foreground">About</a>
              <a href="https://linkedin.com/company/rare-sense-inc" target="_blank" rel="noopener noreferrer" className="marta-label marta-link hover:text-foreground">LinkedIn</a>
            </nav>
            <div className="flex items-center gap-3">
              <img
                src={rareSenseLogo}
                alt="Rare Sense Inc. logo"
                className="h-10 w-auto object-contain"
                loading="lazy"
              />
              <p className="marta-label">© {new Date().getFullYear()} FormaNova, a product of Rare Sense Inc.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
    </>
  );
}
