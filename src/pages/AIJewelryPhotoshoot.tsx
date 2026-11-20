import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowRight, Camera, Sparkles, Shield, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OptimizedImage } from '@/components/ui/optimized-image';
import heroImg from '@/assets/jewelry/hero-vneck-necklace.webp';
import beforeImg from '@/assets/showcase/product-shell-bracelet.webp';
import afterImg from '@/assets/showcase/on-model-shell-bracelet.webp';

const FAQS = [
  {
    q: 'How does the AI jewelry photoshoot work?',
    a: 'Upload a product image of your jewelry — ring, necklace, earring, bracelet, or watch — and our AI generates professional photoshoot renders on realistic models and mannequins. Your product is preserved pixel-perfectly.',
  },
  {
    q: 'What jewelry categories are supported?',
    a: 'FormaNova supports five categories: rings, necklaces, earrings, bracelets, and watches. Each category is optimized for accurate placement and realistic rendering.',
  },
  {
    q: 'How much does it cost?',
    a: 'FormaNova uses credit-based pricing. Plans start at $9 for 100 credits (approximately 10 photos). Standard is $39 for 500 credits, and Pro is $99 for 1,500 credits.',
  },
  {
    q: 'How long does it take to generate a photo?',
    a: 'Most photoshoot renders are generated within minutes. Batch uploads are processed sequentially and you receive an email notification when results are ready.',
  },
];

export default function AIJewelryPhotoshoot() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>AI Jewelry Photoshoot Studio | FormaNova</title>
        <meta name="description" content="AI jewelry photoshoot tool for rings, necklaces, earrings & bracelets. Upload a product image and get professional model photos in minutes. Try now." />
        <link rel="canonical" href="https://formanova.ai/ai-jewelry-photoshoot" />
      </Helmet>
      {/* JSON-LD FAQPage */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQS.map((f) => ({
              '@type': 'Question',
              name: f.q,
              acceptedAnswer: { '@type': 'Answer', text: f.a },
            })),
          }),
        }}
      />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/30">
        <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-16 py-20 md:py-28 grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <p className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground uppercase">
              AI-Powered Jewelry Photography
            </p>
            <h1 className="font-display text-5xl md:text-6xl lg:text-7xl uppercase tracking-wide leading-[0.95]">
              AI Jewelry<br />Photoshoot<br />Studio
            </h1>
            <p className="font-body text-base md:text-lg text-muted-foreground max-w-md leading-relaxed">
              Transform product images into stunning professional photoshoots on realistic models — in minutes, not days. Pixel-perfect preservation guaranteed.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button asChild size="lg" className="font-mono text-[10px] tracking-[0.2em] uppercase">
                <Link to="/login">
                  Get Started <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="font-mono text-[10px] tracking-[0.2em] uppercase">
                <Link to="/pricing">View Pricing</Link>
              </Button>
            </div>
          </div>
          <div className="relative">
            <OptimizedImage
              src={heroImg}
              alt="AI-generated jewelry photoshoot of a diamond necklace on a model"
              className="w-full object-cover border border-border/20"
              priority
              aspectRatio="3/4"
            />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 lg:px-16 py-20 md:py-28">
        <p className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground uppercase mb-4">How It Works</p>
        <h2 className="font-display text-4xl md:text-5xl uppercase tracking-wide mb-16">
          Upload → Generate → Download
        </h2>
        <div className="grid md:grid-cols-4 gap-8">
          {[
            { icon: Camera, title: 'Upload', desc: 'Upload your jewelry product image — mannequin shot, flat lay, or studio capture.' },
            { icon: Sparkles, title: 'AI Generates', desc: 'Our AI places your jewelry on realistic models with professional lighting and styling.' },
            { icon: Shield, title: 'Pixel-Perfect', desc: 'Your product is preserved exactly as-is. No distortion, no color shifts, no hallucinations.' },
            { icon: Zap, title: 'Download', desc: 'Receive high-resolution photoshoot images ready for e-commerce, social media, or print.' },
          ].map((f) => (
            <div key={f.title} className="space-y-4">
              <f.icon className="h-6 w-6 text-foreground" strokeWidth={1.5} />
              <h3 className="font-display text-2xl uppercase tracking-wide">{f.title}</h3>
              <p className="font-body text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Before / After */}
      <section className="border-t border-border/30">
        <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-16 py-20 md:py-28">
          <p className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground uppercase mb-4">See The Difference</p>
          <h2 className="font-display text-4xl md:text-5xl uppercase tracking-wide mb-12">
            From Product to On Model
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <OptimizedImage src={beforeImg} alt="Gold shell and starfish charm bracelet with pearls, product photo on white" className="w-full border border-border/20" aspectRatio="1/1" />
              <p className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground uppercase">Input — Product Photo</p>
            </div>
            <div className="space-y-3">
              <OptimizedImage src={afterImg} alt="The same shell and starfish bracelet worn by a model, generated by FormaNova" className="w-full border border-border/20" aspectRatio="1/1" />
              <p className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground uppercase">Output — On Model</p>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="border-t border-border/30">
        <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-16 py-20 md:py-28">
          <p className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground uppercase mb-4">Supported Categories</p>
          <h2 className="font-display text-4xl md:text-5xl uppercase tracking-wide mb-12">
            Every Type of Jewelry
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            {['Necklaces', 'Earrings', 'Rings', 'Bracelets', 'Watches'].map((cat) => (
              <div key={cat} className="border border-border/30 p-6 text-center">
                <p className="font-display text-xl uppercase tracking-wide">{cat}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing snapshot */}
      <section className="border-t border-border/30">
        <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-16 py-20 md:py-28">
          <p className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground uppercase mb-4">Pricing</p>
          <h2 className="font-display text-4xl md:text-5xl uppercase tracking-wide mb-12">
            Credit-Based Plans
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { name: 'Basic', price: '$9', credits: '100', photos: '10' },
              { name: 'Standard', price: '$39', credits: '500', photos: '50' },
              { name: 'Pro', price: '$99', credits: '1,500', photos: '150' },
            ].map((p) => (
              <div key={p.name} className="border border-border/30 p-8 space-y-4">
                <p className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground uppercase">{p.name}</p>
                <p className="font-display text-4xl uppercase tracking-tight">{p.price}</p>
                <p className="font-mono text-sm text-muted-foreground">{p.credits} credits · ~{p.photos} photos</p>
              </div>
            ))}
          </div>
          <div className="mt-8">
            <Button asChild size="lg" className="font-mono text-[10px] tracking-[0.2em] uppercase">
              <Link to="/pricing">See Full Pricing <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-border/30">
        <div className="max-w-3xl mx-auto px-6 md:px-12 lg:px-16 py-20 md:py-28">
          <p className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground uppercase mb-4">FAQ</p>
          <h2 className="font-display text-4xl md:text-5xl uppercase tracking-wide mb-12">
            Frequently Asked Questions
          </h2>
          <div className="space-y-8">
            {FAQS.map((f) => (
              <div key={f.q} className="space-y-2">
                <h3 className="font-display text-xl uppercase tracking-wide">{f.q}</h3>
                <p className="font-body text-sm text-muted-foreground leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border/30">
        <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-16 py-20 md:py-28 text-center space-y-8">
          <h2 className="font-display text-4xl md:text-5xl uppercase tracking-wide">
            Ready to Transform Your Jewelry Photography?
          </h2>
          <Button asChild size="lg" className="font-mono text-[10px] tracking-[0.2em] uppercase">
            <Link to="/login">Get Started Now <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
