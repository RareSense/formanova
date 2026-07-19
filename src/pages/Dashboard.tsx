import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { usePrefetchGenerations } from '@/hooks/use-prefetch-generations';
import { useShopifyStatus } from '@/hooks/useShopify';

// Reuse the same hero imagery
import heroNecklace from '@/assets/jewelry/hero-necklace-diamond.jpg';
import textToCadThumb from '@/assets/cad-studio-thumb.webp';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5 },
  },
};


export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refetch: refetchShopifyStatus } = useShopifyStatus();
  const userName = user?.email ? user.email.split('@')[0] : '';

  // Prefetch generation history in background so it's instant when user opens Generations
  usePrefetchGenerations();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('shopify_connected') !== 'true') return;
    refetchShopifyStatus().finally(() => {
      window.history.replaceState({}, '', window.location.pathname);
    });
  }, [refetchShopifyStatus]);

  return (
    <>
      <Helmet>
        <title>Dashboard | FormaNova Studio</title>
        <meta name="description" content="Your FormaNova dashboard. Start a jewelry photoshoot, generate a 3D CAD model, or browse your creation history." />
        <link rel="canonical" href="/dashboard" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
    <div className="min-h-[calc(100vh-5rem)] bg-background py-6 px-6 md:px-12 lg:px-16">
      {/* Header — matches Studio page */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-7xl mx-auto mb-6 flex items-end justify-between"
      >
        <div>
          <span className="font-mono text-[9px] tracking-[0.3em] text-muted-foreground uppercase block mb-1">
            {userName ? `Welcome, ${userName}` : 'Welcome'}
          </span>
        </div>
        <p className="hidden md:block font-mono text-[9px] tracking-[0.2em] text-muted-foreground uppercase">
          Choose your studio
        </p>
      </motion.div>

      {/* Pathway Tiles */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-7xl mx-auto grid md:grid-cols-2 gap-4"
      >
        {/* From Jewelry Photos */}
        <motion.button
          variants={itemVariants}
          whileHover={{ scale: 1.02, y: -4 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/studio')}
          className="group relative aspect-[4/3] marta-frame overflow-hidden cursor-pointer transition-all duration-300 hover:border-formanova-hero-accent hover:shadow-[0_0_30px_-5px_hsl(var(--formanova-hero-accent)/0.4)] text-left"
        >
          <OptimizedImage
            src={heroNecklace}
            alt="From jewelry photos"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
          />
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-background/90 via-background/40 to-transparent" />

          <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-8">
            <h2 className="font-display text-2xl md:text-4xl lg:text-5xl uppercase tracking-wide text-foreground transition-transform duration-300 group-hover:translate-x-1">
              Photo Studio
            </h2>
            <p className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase mt-2 max-w-xs">
              Upload jewelry photos · Generate on-model imagery
            </p>
          </div>

          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-0 translate-x-2">
            <div className="w-9 h-9 flex items-center justify-center bg-formanova-hero-accent shadow-lg shadow-formanova-hero-accent/30">
              <ArrowRight className="w-4 h-4 text-primary-foreground" />
            </div>
          </div>
        </motion.button>

        <motion.button
          variants={itemVariants}
          onClick={() => navigate('/studio-cad')}
          className="group relative aspect-[4/3] marta-frame overflow-hidden text-left cursor-pointer transition-all duration-300 hover:border-formanova-hero-accent hover:shadow-[0_0_30px_-5px_hsl(var(--formanova-hero-accent)/0.4)]"
        >
          <OptimizedImage
            src={textToCadThumb}
            alt="From CAD designs"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-background/90 via-background/40 to-transparent" />

          <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-8">
            <h2 className="font-display text-2xl md:text-4xl lg:text-5xl uppercase tracking-wide text-foreground">
              CAD Studio
            </h2>
            <p className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase mt-2">
              Generate text-to-CAD models and catalog visuals
            </p>
          </div>

          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
            <div className="w-8 h-8 flex items-center justify-center bg-formanova-hero-accent shadow-lg shadow-formanova-hero-accent/30">
              <ArrowRight className="w-4 h-4 text-primary-foreground" />
            </div>
          </div>
        </motion.button>
      </motion.div>

    </div>
    </>
  );
}
