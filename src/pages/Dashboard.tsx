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
import textToCadImg from '@/assets/text-to-cad-thumb.webp';
import imageToCadImg from '@/assets/image-to-cad-thumb.webp';

type Workflow = {
  title: string;
  description: string;
  /** Existing destination, unchanged from the Photo Studio / CAD Studio pages. */
  route: string;
  icon: React.ComponentType<{ className?: string }>;
  image: string;
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
    title: 'Text to CAD',
    description: 'Describe your jewelry and generate a CAD model.',
    route: '/text-to-cad',
    icon: TextToCadIcon,
    wideIcon: true,
    image: textToCadImg,
  },
  {
    title: 'Image to CAD',
    description: 'Turn inspiration images into a CAD model.',
    route: '/image-to-cad',
    icon: ImageToCadIcon,
    wideIcon: true,
    image: imageToCadImg,
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
 * workflows, not either one of them. Outlined and quiet on purpose: filled or
 * accented it reads as a button, and this is metadata, not an action.
 */
function RhinoTag() {
  return (
    <span className="inline-flex items-center gap-1.5 border border-formanova-hero-accent px-2 py-1 font-mono text-[9px] md:text-[10px] tracking-[0.15em] uppercase text-foreground font-medium whitespace-nowrap">
      <RhinoIcon className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
      Rhino compatible
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
    <div className="flex items-center gap-3 md:gap-4 mb-2.5 md:mb-3 [@media(max-height:820px)]:mb-2">
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
      <div className="flex items-center gap-2.5 md:gap-3 shrink-0">
        <h2
          id={id}
          className="font-display text-2xl md:text-3xl [@media(max-height:860px)]:text-xl uppercase tracking-wide text-formanova-hero-accent leading-none whitespace-nowrap"
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
  'px-6 py-3 sm:py-2 bg-formanova-hero-accent text-primary-foreground font-mono text-[10px] md:text-xs tracking-[0.2em] uppercase inline-flex items-center justify-center gap-2 whitespace-nowrap transition-all duration-300 hover:opacity-90';

function WorkflowCard({
  workflow,
  onSelect,
  compact = false,
}: {
  workflow: Workflow;
  onSelect: (workflow: Workflow) => void;
  /** Stacked runs two rows of these, so every vertical unit it spends is
   *  doubled. The content block is what stops the card shrinking, not the
   *  image, so compact trims the chip, type and button rather than the art. */
  compact?: boolean;
}) {
  const Icon = workflow.icon;

  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={() => onSelect(workflow)}
      className={`${CARD_FRAME} flex flex-col`}
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
      <div
        className={`relative z-10 flex flex-col items-center flex-1 bg-card ${
          compact ? 'px-3 py-2.5' : 'px-4 py-4 md:py-5'
        }`}
      >
        <div
          className={`flex items-center justify-center border border-border bg-background relative z-10 ${
            compact ? 'w-9 h-9 -mt-[26px] mb-1.5' : 'w-12 h-12 -mt-11 mb-2'
          }`}
        >
          <Icon
            className={`text-formanova-hero-accent ${
              workflow.wideIcon
                ? compact ? 'h-5 w-auto' : 'h-6 md:h-7 w-auto'
                : compact ? 'w-5 h-5' : 'w-6 h-6 md:w-7 md:h-7'
            }`}
          />
        </div>
        <h3
          className={`font-display uppercase tracking-wide text-foreground leading-none ${
            compact ? 'text-base mb-1' : 'text-xl md:text-2xl mb-1.5'
          }`}
        >
          {workflow.title}
        </h3>
        <p
          className={`font-mono tracking-[0.12em] text-foreground/80 uppercase text-center ${
            compact ? 'text-[9px] leading-snug max-w-[200px]' : 'text-[11px] md:text-xs tracking-[0.15em] max-w-[240px]'
          }`}
        >
          {workflow.description}
        </p>
        {/* mt-auto on the wrapper, not the button, so the Continue buttons line
            up across a row without inflating the button's own padding. */}
        <div className={`mt-auto ${compact ? 'pt-2' : 'pt-3 md:pt-4'}`}>
          <button
            type="button"
            aria-label={`Continue to ${workflow.title}`}
            className={
              compact
                ? 'px-4 py-1.5 bg-formanova-hero-accent text-primary-foreground font-mono text-[9px] tracking-[0.2em] uppercase inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-all duration-300 hover:opacity-90'
                : CONTINUE_BUTTON
            }
          >
            Continue
            <ArrowRight className="w-3 h-3 shrink-0" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Split card for the Grid layout: image beside the copy rather than above it.
 *
 * This is the shape that fits four cards on one screen. Two rows of
 * image-on-top cards run roughly twice the height of a laptop viewport, so
 * turning the card on its side is what buys the second row.
 *
 * Softer frame than the other layouts (rounded corners and a shadow rather
 * than a hairline) so the wider card still reads as one object.
 *
 * Image on top below sm, where a side-by-side split leaves the copy about
 * 180px wide.
 */
function PanelWorkflowCard({
  workflow,
  onSelect,
}: {
  workflow: Workflow;
  onSelect: (workflow: Workflow) => void;
  /** Accepted so this can share the Card slot with WorkflowCard. Grid has the
   *  room the stacked rows do not, so it ignores the flag. */
  compact?: boolean;
}) {
  const Icon = workflow.icon;

  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={() => onSelect(workflow)}
      className="group relative flex flex-col sm:flex-row h-full overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-all duration-300 hover:border-formanova-hero-accent hover:shadow-[0_0_30px_-8px_hsl(var(--formanova-hero-accent)/0.45)] cursor-pointer"
    >
      {/* Image */}
      <div className="relative w-full sm:w-[42%] shrink-0 aspect-[4/3] sm:aspect-auto overflow-hidden">
        <img
          src={workflow.image}
          alt={workflow.title}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>

      {/* Content. Same centred composition as the other cards. */}
      <div className="flex flex-col items-center justify-center flex-1 px-5 py-5 md:px-6 md:py-6 [@media(max-height:820px)]:py-4 text-center">
        <span className="w-11 h-11 [@media(max-height:820px)]:w-9 [@media(max-height:820px)]:h-9 shrink-0 flex items-center justify-center border border-border bg-background rounded-md mb-3 [@media(max-height:820px)]:mb-2">
          <Icon
            className={`text-formanova-hero-accent ${
              workflow.wideIcon ? 'h-6 md:h-7 w-auto' : 'w-6 h-6 md:w-7 md:h-7'
            }`}
          />
        </span>
        <h3 className="font-display text-xl md:text-2xl uppercase tracking-wide text-foreground leading-none mb-2">
          {workflow.title}
        </h3>
        <p className="font-mono text-[11px] md:text-xs tracking-[0.12em] text-foreground/80 uppercase leading-snug max-w-[240px]">
          {workflow.description}
        </p>
        <button
          type="button"
          aria-label={`Continue to ${workflow.title}`}
          className={`${CONTINUE_BUTTON} mt-4 [@media(max-height:820px)]:mt-3`}
        >
          Continue
          <ArrowRight className="w-3 h-3 shrink-0" />
        </button>
      </div>
    </motion.div>
  );
}

// ── TEMPORARY: layout A/B preview ──────────────────────────────────────────
// Scaffolding so the arrangements can be judged against each other in the
// running app. Once one is chosen, delete this block, the toggle in the
// header, and whichever card components are not kept.
type DashboardLayout = 'columns' | 'stacked' | 'grid';
const LAYOUT_KEY = 'formanova_dashboard_layout_preview';
const LAYOUTS: DashboardLayout[] = ['columns', 'stacked', 'grid'];

function readStoredLayout(): DashboardLayout {
  try {
    const stored = localStorage.getItem(LAYOUT_KEY) as DashboardLayout | null;
    return stored && LAYOUTS.includes(stored) ? stored : 'columns';
  } catch {
    return 'columns';
  }
}

function LayoutToggle({
  layout,
  onChange,
}: {
  layout: DashboardLayout;
  onChange: (next: DashboardLayout) => void;
}) {
  const options: { value: DashboardLayout; label: string }[] = [
    { value: 'columns', label: 'Side by side' },
    { value: 'stacked', label: 'Stacked' },
    { value: 'grid', label: 'Grid' },
  ];

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-px border border-border bg-background/95 backdrop-blur-sm shadow-lg">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={layout === option.value}
          className={`px-3 py-1.5 font-mono text-[9px] md:text-[10px] tracking-[0.2em] uppercase transition-colors duration-200 ${
            layout === option.value
              ? 'bg-formanova-hero-accent text-primary-foreground'
              : 'bg-background text-muted-foreground hover:text-foreground'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
// ── end TEMPORARY ──────────────────────────────────────────────────────────

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

  // TEMPORARY: see the layout A/B preview block above.
  const [layout, setLayout] = useState<DashboardLayout>(readStoredLayout);
  const chooseLayout = (next: DashboardLayout) => {
    setLayout(next);
    try {
      localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      // Private mode. Losing the preview choice on reload costs one click.
    }
  };
  const isStacked = layout === 'stacked';
  const isGrid = layout === 'grid';
  const Card = isGrid ? PanelWorkflowCard : WorkflowCard;

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

      <div className="min-h-[calc(100dvh-5rem)] bg-background flex flex-col items-center justify-center px-4 sm:px-6 md:px-8 lg:px-10 overflow-x-hidden py-3 md:py-4 [@media(max-height:820px)]:py-2">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="text-center mb-3 md:mb-4 [@media(max-height:820px)]:mb-2 max-w-[720px]"
        >
          <p className={`font-mono text-[10px] md:text-xs tracking-[0.3em] uppercase text-formanova-hero-accent mb-1.5 font-medium [@media(max-height:780px)]:hidden${isStacked ? ' hidden' : ''}`}>
            {userName ? `Welcome, ${userName}` : 'Welcome'}
          </p>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl [@media(max-height:820px)]:md:text-4xl uppercase tracking-wide text-foreground leading-none mb-1.5">
            What do you want to create?
          </h1>
          <p className={`font-mono text-[11px] md:text-xs tracking-[0.12em] text-foreground/70 uppercase font-medium [@media(max-height:780px)]:hidden${isStacked ? ' hidden' : ''}`}>
            Pick a workflow to begin
          </p>
        </motion.div>

        {/* Workflow sections. Side by side puts the two groups in adjacent
            columns; stacked keeps Photography over CAD. Same card either way. */}
        
          <motion.div
            key={layout}
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className={
              isStacked
                ? 'w-full max-w-[470px] [@media(max-height:860px)]:max-w-[290px] grid gap-y-4 [@media(max-height:860px)]:gap-y-2 pb-1 [@media(max-height:860px)]:pb-0'
                : isGrid
                  ? 'w-full max-w-[1180px] grid gap-y-4 md:gap-y-5 pb-2'
                  : 'w-full max-w-[1400px] grid lg:grid-cols-2 gap-x-6 xl:gap-x-8 gap-y-6 pb-4'
            }
          >
            <section aria-labelledby="dashboard-photography" className="flex flex-col">
              <CategoryDivider id="dashboard-photography" label="Photography" />
              <div className={`grid grid-cols-1 ${isGrid ? "md:grid-cols-2" : "sm:grid-cols-2"} gap-4 md:gap-5 flex-1`}>
                {photographyWorkflows.map((workflow) => (
                  <Card key={workflow.title} workflow={workflow} onSelect={handleSelect} compact={isStacked} />
                ))}
              </div>
            </section>

            <section aria-labelledby="dashboard-cad" className="flex flex-col">
              <CategoryDivider id="dashboard-cad" label="CAD" tag={<RhinoTag />} />
              <div className={`grid grid-cols-1 ${isGrid ? "md:grid-cols-2" : "sm:grid-cols-2"} gap-4 md:gap-5 flex-1`}>
                {cadWorkflows.map((workflow) => (
                  <Card key={workflow.title} workflow={workflow} onSelect={handleSelect} compact={isStacked} />
                ))}
              </div>
            </section>
          </motion.div>
      </div>

      {/* TEMPORARY: layout A/B preview. */}
      <LayoutToggle layout={layout} onChange={chooseLayout} />

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
