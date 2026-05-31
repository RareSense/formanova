import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { trackStudioTypeSelected } from '@/lib/posthog-events';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

import { PeopleIcon } from '@/components/icons/PeopleIcon';
import { RingIcon } from '@/components/icons/RingIcon';

import modelShotImg from '@/assets/jewelry/model-shot-card.webp';
import productShotImg from '@/assets/cad-studio/product-shot-card.webp';

const modes = [
  {
    title: 'Model Shot',
    description: 'Generate jewelry images worn by a model.',
    route: '/studio/categories',
    comingSoon: false,
    icon: PeopleIcon,
    image: modelShotImg,
  },
  {
    title: 'Product Shot',
    description: 'Create product images for listings and PDPs.',
    route: '/studio/product-shot/categories',
    comingSoon: false,
    icon: RingIcon,
    image: productShotImg,
  },
];

export default function StudioTypeSelection() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[calc(100dvh-5rem)] bg-background flex flex-col items-center justify-center px-4 sm:px-6 md:px-8 lg:px-10 overflow-x-hidden pt-4 md:pt-8 lg:pt-0">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="text-center mb-8 md:mb-12"
      >
        <p className="font-mono text-[10px] md:text-xs tracking-[0.3em] uppercase text-formanova-hero-accent mb-3 font-medium">
          You are in Photo Studio
        </p>
        <h1 className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl uppercase tracking-wide text-foreground leading-none mb-3">
          What do you want to create?
        </h1>
        <p className="font-mono text-[11px] md:text-sm tracking-[0.12em] text-foreground/70 uppercase font-medium">
          Choose the type of image you want to generate
        </p>
      </motion.div>

      {/* Feature Cards */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="w-full max-w-[1200px] grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5 lg:gap-6 pb-6 md:pb-10"
      >
        {modes.map((mode) => {
          const Icon = mode.icon;

          return (
            <motion.div
              key={mode.title}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => {
                trackStudioTypeSelected(mode.title === 'Product Shot' ? 'product-shot' : 'model-shot');
                navigate(mode.route);
              }}
              className="group relative marta-frame overflow-hidden flex flex-col transition-all duration-300 hover:border-formanova-hero-accent hover:shadow-[0_0_30px_-5px_hsl(var(--formanova-hero-accent)/0.4)] cursor-pointer"
            >
              {/* Image */}
              <div className="relative aspect-[3/2] overflow-hidden">
                <img
                  src={mode.image}
                  alt={mode.title}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>

              {/* Content */}
              <div className="relative z-10 flex flex-col items-center px-4 py-5 md:py-6 bg-card">
                <div className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center border border-border bg-background -mt-10 md:-mt-11 mb-3 relative z-10">
                  <Icon className="w-4 h-4 md:w-5 md:h-5 text-formanova-hero-accent" />
                </div>
                <h2 className="font-display text-xl md:text-2xl uppercase tracking-wide text-foreground leading-none mb-2">
                  {mode.title}
                </h2>
                <p className="font-mono text-[11px] md:text-xs tracking-[0.15em] text-foreground/80 uppercase text-center max-w-[240px]">
                  {mode.description}
                </p>
                <button
                  className="mt-4 md:mt-5 px-6 py-2.5 bg-formanova-hero-accent text-primary-foreground font-mono text-[10px] md:text-xs tracking-[0.2em] uppercase inline-flex items-center justify-center gap-2 whitespace-nowrap transition-all duration-300 hover:opacity-90"
                >
                  Continue
                  <ArrowRight className="w-3 h-3 shrink-0" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Footer hint */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="font-mono text-xs md:text-sm tracking-[0.15em] text-foreground/80 uppercase font-semibold pb-6"
      >
        You can switch between modes anytime in the{' '}
        <span className="text-formanova-hero-accent">Studio</span>
      </motion.p>
    </div>
  );
}
