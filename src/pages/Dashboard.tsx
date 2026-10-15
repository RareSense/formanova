import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { usePrefetchGenerations } from '@/hooks/use-prefetch-generations';
import { useShopifyStatus } from '@/hooks/useShopify';
import { trackStudioTypeSelected } from '@/lib/posthog-events';

import { PeopleIcon } from '@/components/icons/PeopleIcon';
import { RingIcon } from '@/components/icons/RingIcon';
import { RhinoIcon } from '@/components/icons/RhinoIcon';
import { TextToCadIcon } from '@/components/icons/TextToCadIcon';
import { ImageToCadIcon } from '@/components/icons/ImageToCadIcon';
import { EffortIntroModal } from '@/components/studio/EffortIntroModal';
import type { EffortLevel } from '@/components/studio/EffortToggle';

import modelShotImg from '@/assets/jewelry/model-shot-card.webp';
import productShotImg from '@/assets/cad-studio/product-shot-card.webp';
import CadStoryPicture, { type CadStory } from '@/components/create-cad/CadStoryPicture';
// Real Rhino captures of models we built, as theme-coloured layers.
import fireflyPhoto from '@/assets/cad-cards/story/firefly-photo.webp';
import ladybugPhoto from '@/assets/cad-cards/story/ladybug-photo.webp';
import earringShade from '@/assets/cad-cards/story/earring-shade.webp';
import earringMetal from '@/assets/cad-cards/story/earring-metal.webp';
import earringGems from '@/assets/cad-cards/story/earring-gems.webp';
import ringShade from '@/assets/cad-cards/story/ring-shade.webp';
import ringMetal from '@/assets/cad-cards/story/ring-metal.webp';
import ringGems from '@/assets/cad-cards/story/ring-gems.webp';
import ladybugShade from '@/assets/cad-cards/story/ladybug-shade.webp';
import ladybugMetal from '@/assets/cad-cards/story/ladybug-metal.webp';
import ladybugGems from '@/assets/cad-cards/story/ladybug-gems.webp';

type Workflow = {
  title: string;
  description: string;
  /** Existing destination, unchanged from the Photo Studio / CAD Studio pages. */
  route: string;
  icon: React.ComponentType<{ className?: string }>;
  image?: string;
  /** CAD cards: what goes in and the CAD it becomes, drawn in theme colours. */
  story?: CadStory;
  /** Photography still passes through the first-run effort chooser. */
  usesEffortIntro?: boolean;
  /** PostHog value, identical to what the Photo Studio page sent. */
  studioType?: 'model-shot' | 'product-shot';
  /** Wide marks (200x128) size by height so their ring matches the square
   *  marks. Square marks size both axes. */
  wideIcon?: boolean;
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
    title: 'CAD from Image',
    description: 'Recreate the jewelry in your photo.',
    route: '/image-to-cad',
    icon: ImageToCadIcon,
    wideIcon: true,
    story: { inputLabel: 'Your photo', input: { kind: 'photo', src: fireflyPhoto }, cad: { shade: earringShade, metal: earringMetal, gems: earringGems } },
  },
  {
    title: 'CAD from Idea',
    description: 'Describe or sketch a new design.',
    route: '/text-to-cad',
    icon: TextToCadIcon,
    wideIcon: true,
    story: { inputLabel: 'Your idea', input: { kind: 'prompt', text: "Men's signet ring, cushion centre stone with a halo, engraved crest on both shoulders" }, cad: { shade: ringShade, metal: ringMetal, gems: ringGems } },
  },
  {
    title: 'CAD from Inspiration',
    description: 'Turn any picture into a new design.',
    route: '/inspiration-to-cad',
    icon: ImageToCadIcon,
    wideIcon: true,
    story: { inputLabel: 'Inspiration', input: { kind: 'photo', src: ladybugPhoto, cover: true }, cad: { shade: ladybugShade, metal: ladybugMetal, gems: ladybugGems } },
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

/**
 * Compatibility note for the CAD category.
 *
 * Sits on the divider rather than on each card because it describes both CAD
 * workflows, not either one of them.
 *
 * No box. An outlined pill in an accent colour is the shape of a chip or a
 * filter, so people try to press it. Mono type inside square brackets is the
 * conventional way to write a machine-readable fact, and nothing about it
 * invites a click: no border, no fill, no hover, default cursor.
 *
 * Mark and words sit inside the brackets together and share one colour. Split
 * across the bracket, or coloured differently from each other, they read as
 * two separate things rather than one label. Foreground rather than accent
 * keeps it out of competition with the CAD label beside it.
 *
 * The brackets are aria-hidden so this is announced as "Rhino compatible"
 * rather than with the punctuation read out.
 */
function RhinoTag() {
  return (
    <span className="inline-flex items-center gap-1 cursor-default font-mono text-[9px] md:text-[10px] tracking-[0.15em] uppercase text-foreground font-bold whitespace-nowrap">
      <span aria-hidden="true">[</span>
      <RhinoIcon className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
      <span>Rhino compatible</span>
      <span aria-hidden="true">]</span>
    </span>
  );
}

/**
 * Category divider: a centred cluster with a rule running out to each edge.
 *
 * Both rules are flex-1, so they are always exactly the same length and the
 * cluster stays centred whatever it contains, tag or no tag.
 */
function CategoryDivider({
  id,
  label,
  tag,
}: {
  id: string;
  label: string;
  tag?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 md:gap-4 mb-1.5 sm:mb-2.5 md:mb-3 [@media(max-height:820px)]:mb-2">
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
      <div className="flex items-center gap-2.5 md:gap-3 shrink-0">
        <h2
          id={id}
          className="font-display text-xl sm:text-2xl md:text-3xl [@media(max-height:860px)]:text-xl uppercase tracking-wide text-formanova-hero-accent leading-none whitespace-nowrap"
        >
          {label}
        </h2>
        {tag}
      </div>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </div>
  );
}

const CARD_FRAME =
  'group relative marta-frame overflow-hidden h-full transition-all duration-300 hover:border-formanova-hero-accent hover:shadow-[0_0_30px_-5px_hsl(var(--formanova-hero-accent)/0.4)] cursor-pointer';

const CONTINUE_BUTTON =
  'px-4 py-2.5 sm:px-6 sm:py-2 bg-formanova-hero-accent text-primary-foreground font-mono text-[10px] md:text-xs tracking-[0.2em] uppercase inline-flex items-center justify-center gap-2 whitespace-nowrap transition-all duration-300 hover:opacity-90';

function WorkflowCard({
  workflow,
  onSelect,
  className = '',
}: {
  workflow: Workflow;
  onSelect: (workflow: Workflow) => void;
  /** Grid placement only. */
  className?: string;
}) {
  const Icon = workflow.icon;

  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={() => onSelect(workflow)}
      className={`${CARD_FRAME} flex flex-col ${className}`}
    >
      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden">
        {workflow.story ? (
          <CadStoryPicture story={workflow.story} />
        ) : (
          <img
            src={workflow.image}
            alt={workflow.title}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center flex-1 px-2.5 py-2 sm:px-4 sm:py-4 md:py-5 bg-card">
        <div className="w-9 h-9 sm:w-12 sm:h-12 flex items-center justify-center border border-border bg-background -mt-[26px] sm:-mt-11 mb-1 sm:mb-2 relative z-10">
          <Icon
            className={`text-formanova-hero-accent ${
              workflow.wideIcon
                ? 'h-4 sm:h-6 md:h-7 w-auto'
                : 'w-4 h-4 sm:w-6 sm:h-6 md:w-7 md:h-7'
            }`}
          />
        </div>
        <h3 className="font-display text-lg sm:text-xl md:text-2xl uppercase tracking-wide text-foreground leading-none mb-1 sm:mb-1.5">
          {workflow.title}
        </h3>
        <p className="font-mono text-[9px] sm:text-[11px] md:text-xs tracking-[0.1em] sm:tracking-[0.15em] text-foreground/80 uppercase text-center max-w-[240px]">
          {workflow.description}
        </p>
        {/* mt-auto on the wrapper, not the button, so the Continue buttons line
            up across a row without inflating the button's own padding. */}
        <div className="mt-auto pt-2 sm:pt-3 md:pt-4">
          <button
            type="button"
            aria-label={`Continue to ${workflow.title}`}
            className={CONTINUE_BUTTON}
          >
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

      <div className="min-h-[calc(100svh-5rem)] bg-background flex flex-col items-center justify-center px-4 sm:px-6 md:px-8 lg:px-10 overflow-x-hidden py-2 sm:py-3 md:py-4 [@media(max-height:820px)]:py-2">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="text-center mb-1.5 sm:mb-3 md:mb-4 [@media(max-height:820px)]:mb-2 max-w-[720px]"
        >
          <p className="font-mono text-[10px] md:text-xs tracking-[0.3em] uppercase text-formanova-hero-accent mb-1.5 font-medium hidden sm:block [@media(max-height:780px)]:hidden">
            {userName ? `Welcome, ${userName}` : 'Welcome'}
          </p>
          <h1 className="font-display text-xl sm:text-4xl md:text-5xl [@media(max-height:820px)]:md:text-4xl uppercase tracking-wide text-foreground leading-none mb-1 sm:mb-1.5">
            What do you want to create?
          </h1>
          <p className="font-mono text-[11px] md:text-xs tracking-[0.12em] text-foreground/70 uppercase font-medium hidden sm:block [@media(max-height:780px)]:hidden">
            Pick a workflow to begin
          </p>
        </motion.div>

        {/* Every card is the same size on every screen, so no workflow looks
            more important. Laptop: all five in one line (2 + 3). Tablet: one
            section per row, three columns, Photography's two centred. Phone:
            two columns, the third CAD card centred under the other two. */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="w-full max-w-[1400px] grid lg:grid-cols-[2fr_3fr] gap-x-4 lg:gap-x-6 xl:gap-x-8 gap-y-2 sm:gap-y-6 pb-0 sm:pb-4"
          >
            <section aria-labelledby="dashboard-photography" className="flex flex-col">
              <CategoryDivider id="dashboard-photography" label="Photography" />
              <div className="grid grid-cols-2 sm:grid-cols-6 lg:grid-cols-2 gap-2 sm:gap-4 md:gap-5 flex-1">
                {photographyWorkflows.map((workflow, i) => (
                  <WorkflowCard
                    key={workflow.title}
                    workflow={workflow}
                    onSelect={handleSelect}
                    className={`sm:col-span-2 lg:col-span-1 ${i === 0 ? 'sm:col-start-2 lg:col-start-auto' : ''}`}
                  />
                ))}
              </div>
            </section>

            <section aria-labelledby="dashboard-cad" className="flex flex-col">
              <CategoryDivider id="dashboard-cad" label="CAD" tag={<RhinoTag />} />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4 md:gap-5 flex-1">
                {cadWorkflows.map((workflow, i) => (
                  <WorkflowCard
                    key={workflow.title}
                    workflow={workflow}
                    onSelect={handleSelect}
                    className={i === cadWorkflows.length - 1 ? 'col-span-2 w-[calc(50%-4px)] justify-self-center sm:col-span-1 sm:w-auto sm:justify-self-stretch' : ''}
                  />
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
