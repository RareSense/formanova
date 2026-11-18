import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { ArrowRight, PenLine, Phone } from 'lucide-react';

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
import { DoneForYouOfferModal } from '@/components/sales/DoneForYouOfferModal';
import { RubyCallDialog } from '@/components/sales/RubyCallDialog';
import { useDfyOffer } from '@/hooks/use-dfy-offer';
import type { EffortLevel } from '@/components/studio/EffortToggle';

import modelShotImg from '@/assets/jewelry/model-shot-card.webp';
import productShotImg from '@/assets/cad-studio/product-shot-card.webp';
import productShotFromCadImg from '@/assets/cad-studio/product-shot-from-cad-card.webp';
import CadStoryPicture, { type CadStory } from '@/components/create-cad/CadStoryPicture';
// Real Rhino captures of models we built, as theme-coloured layers.
import fireflyPhoto from '@/assets/cad-cards/story/firefly-photo.webp';
import ladybugPhoto from '@/assets/cad-cards/story/ladybug-photo.webp';
import earringShade from '@/assets/cad-cards/story/earring-shade.webp';
import earringMetal from '@/assets/cad-cards/story/earring-metal.webp';
import earringGems from '@/assets/cad-cards/story/earring-gems.webp';
import solitaireShade from '@/assets/cad-cards/story/solitaire-shade.webp';
import solitaireMetal from '@/assets/cad-cards/story/solitaire-metal.webp';
import solitaireGems from '@/assets/cad-cards/story/solitaire-gems.webp';
import ladybugShade from '@/assets/cad-cards/story/ladybug-shade.webp';
import ladybugMetal from '@/assets/cad-cards/story/ladybug-metal.webp';
import ladybugGems from '@/assets/cad-cards/story/ladybug-gems.webp';
import doodleSketch from '@/assets/dashboard/doodle-sketch.webp';
// Placeholder until a Rhino capture of a real doodle job replaces it (owner, 2026-11-19).
import doodleCad from '@/assets/dashboard/doodle-cad.webp';
import doneForYouBench from '@/assets/dashboard/done-for-you-bench.webp';

type Workflow = {
  title: string;
  description: string;
  /** Existing destination, unchanged from the Photo Studio / CAD Studio pages. */
  route?: string;
  /** Done For You opens the call window on this page instead of going somewhere. */
  action?: 'call';
  /** Button text; Continue unless set. */
  cta?: string;
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

// Photography's third card; shown to whoever the Product Shot from CAD page is open to.
const catalogWorkflow: Workflow = {
  title: 'Product Shot from CAD',
  description: 'Turn your CAD files into product pictures.',
  route: '/cad-to-catalog',
  icon: RingIcon,
  image: productShotFromCadImg,
};

const cadWorkflows: Workflow[] = [
  {
    title: 'CAD from Image',
    description: 'Turn your jewelry photo into a CAD model.',
    route: '/image-to-cad',
    icon: ImageToCadIcon,
    wideIcon: true,
    story: { inputLabel: 'Your photo', input: { kind: 'photo', src: fireflyPhoto }, cad: { shade: earringShade, metal: earringMetal, gems: earringGems } },
  },
  // Text and Doodle open straight on the writing box or the drawing pad of the
  // CAD from Idea page, so nobody picks "Idea" and then has to choose again.
  {
    title: 'CAD from Text',
    description: 'Describe your piece in words.',
    route: '/text-to-cad?entry=text',
    icon: TextToCadIcon,
    wideIcon: true,
    story: { inputLabel: 'Your words', input: { kind: 'prompt', text: 'Solitaire ring, round diamond, pavé band…' }, cad: { shade: solitaireShade, metal: solitaireMetal, gems: solitaireGems } },
  },
  {
    title: 'CAD from Doodle',
    description: 'Sketch your piece by hand.',
    route: '/text-to-cad?entry=doodle',
    icon: PenLine,
    story: { inputLabel: 'Your sketch', input: { kind: 'photo', src: doodleSketch }, cad: { image: doodleCad } },
  },
  {
    title: 'CAD from Inspiration',
    description: 'Turn your inspiration into a CAD model.',
    route: '/inspiration-to-cad',
    icon: ImageToCadIcon,
    wideIcon: true,
    story: { inputLabel: 'Inspiration', input: { kind: 'photo', src: ladybugPhoto, cover: true }, cad: { shade: ladybugShade, metal: ladybugMetal, gems: ladybugGems } },
  },
];

// Owner, 2026-11-19: the project service sits beside Photography, for free and paid users alike.
const doneForYou: Workflow = {
  title: 'Done For You',
  description: 'Discuss your project with our AI and get a custom quote.',
  action: 'call',
  cta: 'Call our AI',
  icon: Phone,
  image: doneForYouBench,
};

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

/** Phone and tablet: a card alone on its row sits centred at the width of the others. */
const HALF_CENTRED = 'col-span-2 w-[calc(50%-4px)] justify-self-center sm:w-[calc(50%-8px)] md:w-[calc(50%-10px)] lg:col-span-1 lg:w-auto lg:justify-self-stretch';

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
        {/* Room for two lines on every card, so a long title (Product Shot from CAD)
            does not push its description and button below the cards beside it. */}
        <h3 className="min-h-[2em] flex items-center justify-center text-center font-display text-lg sm:text-xl md:text-2xl uppercase tracking-wide text-foreground leading-none mb-1 sm:mb-1.5">
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
            aria-label={workflow.cta ? `${workflow.cta}: ${workflow.title}` : `Continue to ${workflow.title}`}
            className={CONTINUE_BUTTON}
          >
            {workflow.cta ?? 'Continue'}
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
  const photography = [...photographyWorkflows, catalogWorkflow];
  const [callOpen, setCallOpen] = useState(false);

  // First-run effort chooser, shown on the photography cards before category
  // selection. pendingRoute holds where to go once the user picks; null = closed.
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  // Owner, 2026-11-08: the Done For You offer for paying users, never over the effort chooser.
  const offer = useDfyOffer(user?.id, pendingRoute !== null, 'dashboard');
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
    // The call does not start here: the window opens and the user starts it when ready.
    if (workflow.action === 'call') { setCallOpen(true); return; }
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
            more important. Laptop: four columns. Row one is Photography's three
            cards under one rule, then Done For You under its own Custom Projects
            rule; row two is the four CAD cards. Phone and tablet: two columns,
            each section under its own rule, a lone card centred. */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-[1400px] grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 md:gap-5 lg:gap-x-6 pb-0 sm:pb-4"
        >
          {/* display: contents keeps each section a landmark while its cards stay in the one grid. */}
          <section aria-labelledby="dashboard-photography" className="contents">
          <div className="col-span-2 lg:col-span-3 lg:row-start-1 lg:col-start-1">
            <CategoryDivider id="dashboard-photography" label="Photography" />
          </div>
          {photography.map((workflow, i) => (
            <WorkflowCard
              key={workflow.title}
              workflow={workflow}
              onSelect={handleSelect}
              className={`lg:row-start-2 ${['lg:col-start-1', 'lg:col-start-2', 'lg:col-start-3'][i]} ${i === 2 ? HALF_CENTRED : ''}`}
            />
          ))}
          </section>

          <section aria-labelledby="dashboard-custom-projects" className="contents">
          <div className="col-span-2 mt-2 sm:mt-3 lg:col-span-1 lg:mt-0 lg:row-start-1 lg:col-start-4">
            <CategoryDivider id="dashboard-custom-projects" label="Custom Projects" />
          </div>
          <WorkflowCard workflow={doneForYou} onSelect={handleSelect} className={`lg:row-start-2 lg:col-start-4 ${HALF_CENTRED}`} />
          </section>

          <section aria-labelledby="dashboard-cad" className="contents">
          <div className="col-span-2 mt-2 sm:mt-3 lg:col-span-4 lg:row-start-3">
            <CategoryDivider id="dashboard-cad" label="CAD" tag={<RhinoTag />} />
          </div>
          {cadWorkflows.map((workflow) => (
            <WorkflowCard key={workflow.title} workflow={workflow} onSelect={handleSelect} className="lg:row-start-4" />
          ))}
          </section>
        </motion.div>
      </div>

      <RubyCallDialog open={callOpen} onOpenChange={setCallOpen} />

      {user?.id && <DoneForYouOfferModal userId={user.id} moment="dashboard" open={offer.open} onClose={offer.close} />}

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
