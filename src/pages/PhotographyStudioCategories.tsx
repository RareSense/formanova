import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { studioPathFor } from '@/lib/feature-flags';
import { ArrowRight } from 'lucide-react';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { trackCategorySelected } from '@/lib/posthog-events';
import { TO_SINGULAR } from '@/lib/jewelry-utils';

// Import jewelry images
import heroNecklace from '@/assets/jewelry/hero-necklace-diamond.webp';
import heroGreenEarrings from '@/assets/jewelry/hero-green-earrings.webp';
import heroModelRings from '@/assets/jewelry/hero-model-rings.webp';
import heroHandsBracelets from '@/assets/jewelry/hero-hands-bracelets.webp';
import heroWatch from '@/assets/jewelry/hero-watch.webp';

interface JewelryCategory {
  id: string;
  name: string;
  subtitle: string;
  image: string;
}

const categories: JewelryCategory[] = [
  {
    id: 'necklace',
    name: 'Necklaces',
    subtitle: '',
    image: heroNecklace,
  },
  {
    id: 'earrings',
    name: 'Earrings',
    subtitle: '',
    image: heroGreenEarrings,
  },
  {
    id: 'rings',
    name: 'Rings',
    subtitle: '',
    image: heroModelRings,
  },
  {
    id: 'bracelets',
    name: 'Bracelets',
    subtitle: '',
    image: heroHandsBracelets,
  },
  {
    id: 'watches',
    name: 'Watches',
    subtitle: '',
    image: heroWatch,
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
    },
  },
};

const PH_CATEGORY_SELECTED_KEY = 'ph_category_selected';

const PhotographyStudio = () => {
  const navigate = useNavigate();

  const handleCategoryClick = (category: JewelryCategory) => {
    const isFirst = !sessionStorage.getItem(PH_CATEGORY_SELECTED_KEY);
    sessionStorage.setItem(PH_CATEGORY_SELECTED_KEY, '1');
    trackCategorySelected({
      category: TO_SINGULAR[category.id] ?? category.id,
      is_first_selection: isFirst,
      mode: 'model-shot',
    });
    navigate(studioPathFor(category.id), { state: { mode: 'model-shot' } });
  };

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-background py-6 px-6 md:px-12 lg:px-16">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-7xl mx-auto mb-6 flex items-end justify-between"
      >
        <div>
          <span className="font-mono text-[9px] tracking-[0.3em] text-muted-foreground uppercase block mb-1">
            Select Category
          </span>
        </div>
        <p className="hidden md:block font-mono text-[9px] tracking-[0.2em] text-muted-foreground uppercase">
          AI-powered try-on
        </p>
      </motion.div>

      {/* Categories Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-3 gap-4"
      >
        {categories.map((category, index) => (
          <motion.button
            key={category.id}
            variants={itemVariants}
            whileHover={{ scale: 1.02, y: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleCategoryClick(category)}
            className={`group relative aspect-[4/3] marta-frame overflow-hidden cursor-pointer transition-all duration-300 hover:border-formanova-hero-accent hover:shadow-[0_0_30px_-5px_hsl(var(--formanova-hero-accent)/0.4)] ${
              index === 4 ? 'col-span-2 md:col-span-1 aspect-[8/3] md:aspect-[4/3]' : ''
            }`}
          >
            {/* Background Image */}
            <OptimizedImage
              src={category.image}
              alt={category.name}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
            />
            
            {/* Subtle gradient at bottom for text readability */}
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-background/80 to-transparent" />

            {/* Content */}
            <div className="absolute inset-0 flex flex-col justify-end p-5 md:p-6 text-left">
              <h2 className="font-display text-xl md:text-2xl lg:text-3xl uppercase tracking-wide text-foreground transition-transform duration-300 group-hover:translate-x-1">
                {category.name}
              </h2>
            </div>

            {/* Arrow indicator */}
            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-0 translate-x-2">
              <div className="w-9 h-9 flex items-center justify-center bg-formanova-hero-accent shadow-lg shadow-formanova-hero-accent/30">
                <ArrowRight className="w-4 h-4 text-primary-foreground" />
              </div>
            </div>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
};

export default PhotographyStudio;
