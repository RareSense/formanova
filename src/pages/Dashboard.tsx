import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { ArrowRight, ImageIcon, Layers } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { usePrefetchGenerations } from '@/hooks/use-prefetch-generations';
import { useShopifyStatus } from '@/hooks/useShopify';
import { trackStudioTypeSelected } from '@/lib/posthog-events';

import { PeopleIcon } from '@/components/icons/PeopleIcon';
import { RingIcon } from '@/components/icons/RingIcon';
import { RhinoIcon } from '@/components/icons/RhinoIcon';
import { EffortIntroModal } from '@/components/studio/EffortIntroModal';
import type { EffortLevel } from '@/components/studio/EffortToggle';

import modelShotImg from '@/assets/jewelry/model-shot-card.webp';
import productShotImg from '@/assets/cad-studio/product-shot-card.webp';
import textToCadImg from '@/assets/text-to-cad-thumb.webp';
import imageToCadImg from '@/assets/image-to-cad-thumb.webp';

type Workflow = {
  title: string;
  description: string;
  /** Existing destination, unchanged from the Photo Studio / CAD Studio pages. */
  route: string;
  icon: React.ComponentType<{ className?: string }>;
  image: string;
  /** Quiet format note under the description. CAD workflows only. */
  meta?: string;
  /** Photography still passes through the first-run effort chooser. */
  usesEffortIntro?: boolean;
  /** PostHog value, identical to what the Photo Studio page sent. */
  studioType?: 'model-shot' | 'product-shot';
};

const photographyWorkflows: Workflow[] = [
  {
    title: 'Model Shot',
    description: 'Generate jewelry images worn by a model.',
    route: '/studio/categories',
    icon: PeopleIcon,
    image: modelShotImg,
    usesEffortIntro: true,
    studioType: 'model-shot',
  },
  {
    title: 'Product Shot',
    description: 'Create product images for listings and PDPs.',
    route: '/studio/product-shot/categories',
    icon: RingIcon,
    image: productShotImg,
    usesEffortIntro: true,
    studioType: 'product-shot',
  },
];

const cadWorkflows: Workflow[] = [
  {
    title: 'Text to CAD',
    description: 'Describe your jewelry and generate a CAD model.',
    route: '/text-to-cad',
    icon: Layers,
    image: textToCadImg,
    meta: 'Rhino compatible · .3DM',
  },
  {
    title: 'Image to CAD',
    description: 'Turn inspiration images into a CAD model.',
    route: '/image-to-cad',
    icon: ImageIcon,
    image: imageToCadImg,
    meta: 'Rhino compatible · .3DM',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

function SectionHeading({ id, label }: { id: string; label: string }) {
  return (
    <div className="flex items-center gap-3 md:gap-4 mb-3">
      {/* Display face at a size above the card titles, so the two groups read
          as sections rather than as another line of card copy. */}
      <h2
        id={id}
        className="font-display text-2xl md:text-3xl uppercase tracking-wide text-formanova-hero-accent leading-none whitespace-nowrap"
      >
        {label}
      </h2>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </div>
  );
}

function WorkflowCard({
  workflow,
  onSelect,
}: {
  workflow: Workflow;
  onSelect: (workflow: Workflow) => void;
}) {
  const Icon = workflow.icon;

  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={() => onSelect(workflow)}
      className="group relative marta-frame overflow-hidden flex flex-col h-full transition-all duration-300 hover:border-formanova-hero-accent hover:shadow-[0_0_30px_-5px_hsl(var(--formanova-hero-accent)/0.4)] cursor-pointer"
    >
      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={workflow.image}
          alt={workflow.title}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center flex-1 px-4 py-4 md:py-5 bg-card">
        <div className="w-10 h-10 flex items-center justify-center border border-border bg-background -mt-9 mb-2.5 relative z-10">
          <Icon className="w-4 h-4 md:w-5 md:h-5 text-formanova-hero-accent" />
        </div>
        <h3 className="font-display text-xl md:text-2xl uppercase tracking-wide text-foreground leading-none mb-1.5">
          {workflow.title}
        </h3>
        <p className="font-mono text-[11px] md:text-xs tracking-[0.15em] text-foreground/80 uppercase text-center max-w-[240px]">
          {workflow.description}
        </p>
        {workflow.meta && (
          <p className="mt-2 flex items-center justify-center gap-1.5 font-mono text-[10px] md:text-[11px] tracking-[0.15em] text-foreground/75 uppercase text-center">
            <RhinoIcon className="w-4 h-4 shrink-0" />
            {workflow.meta}
          </p>
        )}
        {/* mt-auto on the wrapper, not the button, so the Continue buttons line
            up across a row without inflating the button's own padding. */}
        <div className="mt-auto pt-3 md:pt-4">
          <button className="px-6 py-2 bg-formanova-hero-accent text-primary-foreground font-mono text-[10px] md:text-xs tracking-[0.2em] uppercase inline-flex items-center justify-center gap-2 whitespace-nowrap transition-all duration-300 hover:opacity-90">
            Continue
            <ArrowRight className="w-3 h-3 shrink-0" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refetch: refetchShopifyStatus } = useShopifyStatus();
  const userName = user?.email ? user.email.split('@')[0] : '';

  // First-run effort chooser, shown on the photography cards before category
  // selection. pendingRoute holds where to go once the user picks; null = closed.
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const defaultEffort: EffortLevel =
    localStorage.getItem('formanova_studio_effort') === 'high' ? 'high' : 'low';

  // Prefetch generation history in background so it's instant when user opens Generations
  usePrefetchGenerations();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('shopify_connected') !== 'true') return;
    refetchShopifyStatus().finally(() => {
      window.history.replaceState({}, '', window.location.pathname);
    });
  }, [refetchShopifyStatus]);

  const handleSelect = (workflow: Workflow) => {
    if (workflow.studioType) trackStudioTypeSelected(workflow.studioType);
    // First time through photography: pop the effort chooser and defer
    // navigation until they choose. Afterwards (seen flag set) go straight
    // through, like any other card.
    if (workflow.usesEffortIntro && !localStorage.getItem('formanova_effort_intro_seen')) {
      setPendingRoute(workflow.route);
    } else {
      navigate(workflow.route);
    }
  };

  return (
    <>
      <Helmet>
        <title>Dashboard | FormaNova Studio</title>
        <meta name="description" content="Your FormaNova dashboard. Start a jewelry photoshoot, generate a 3D CAD model, or browse your creation history." />
        <link rel="canonical" href="/dashboard" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="min-h-[calc(100dvh-5rem)] bg-background flex flex-col items-center justify-center px-4 sm:px-6 md:px-8 lg:px-10 overflow-x-hidden py-5 md:py-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="text-center mb-5 md:mb-6 max-w-[720px]"
        >
          <p className="font-mono text-[10px] md:text-xs tracking-[0.3em] uppercase text-formanova-hero-accent mb-2 font-medium">
            {userName ? `Welcome, ${userName}` : 'Welcome'}
          </p>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl uppercase tracking-wide text-foreground leading-none mb-2">
            What do you want to create?
          </h1>
          <p className="font-mono text-[11px] md:text-xs tracking-[0.12em] text-foreground/70 uppercase font-medium">
            Choose a studio workflow to get started
          </p>
        </motion.div>

        {/* Workflow sections.
            Side by side from xl up, which is what keeps all four cards on one
            screen: stacked, the second section always fell below the fold. */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-[1400px] grid xl:grid-cols-2 gap-x-8 gap-y-6 pb-4"
        >
          <section aria-labelledby="dashboard-photography" className="flex flex-col">
            <SectionHeading id="dashboard-photography" label="Photography" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5 flex-1">
              {photographyWorkflows.map((workflow) => (
                <WorkflowCard key={workflow.title} workflow={workflow} onSelect={handleSelect} />
              ))}
            </div>
          </section>

          <section aria-labelledby="dashboard-cad" className="flex flex-col">
            <SectionHeading id="dashboard-cad" label="CAD" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5 flex-1">
              {cadWorkflows.map((workflow) => (
                <WorkflowCard key={workflow.title} workflow={workflow} onSelect={handleSelect} />
              ))}
            </div>
          </section>
        </motion.div>
      </div>

      <EffortIntroModal
        open={pendingRoute !== null}
        defaultEffort={defaultEffort}
        onConfirm={(effort, dontShowAgain) => {
          localStorage.setItem('formanova_studio_effort', effort);
          if (dontShowAgain) localStorage.setItem('formanova_effort_intro_seen', 'true');
          const route = pendingRoute;
          setPendingRoute(null);
          if (route) navigate(route);
        }}
        onDismiss={() => setPendingRoute(null)}
      />
    </>
  );
}
