import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { ArrowRight, Layers, ImageIcon } from "lucide-react";

import textToCadImg from "@/assets/text-to-cad-thumb.webp";
import imageToCadImg from "@/assets/image-to-cad-thumb.webp";

const cadFeatures = [
  {
    title: "Text to CAD",
    description: "Describe your ring and generate a CAD model from the text.",
    route: "/text-to-cad",
    comingSoon: false,
    icon: Layers,
    image: textToCadImg,
  },
  {
    title: "Image to CAD",
    description: "Upload up to five inspiration images and generate a CAD model.",
    route: "/image-to-cad",
    comingSoon: false,
    icon: ImageIcon,
    image: imageToCadImg,
  },
];

export default function CADStudio() {
  const navigate = useNavigate();

  return (
    <>
      <Helmet>
        <title>CAD Studio | FormaNova</title>
        <meta name="description" content="Browse, edit, and export your AI-generated 3D jewelry CAD models. Refine materials and prepare for manufacturing." />
        <link rel="canonical" href="/studio-cad" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
    <div className="min-h-[calc(100dvh-5rem)] bg-background flex flex-col items-center justify-center px-4 sm:px-6 md:px-8 lg:px-10 overflow-x-hidden pt-4 md:pt-8 lg:pt-0">
      {/* Header */}
      <motion.h1
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="font-display text-5xl md:text-6xl lg:text-[10rem] uppercase tracking-wide text-center pt-4 md:pt-8 lg:pt-6 text-foreground leading-none mb-3 md:mb-4"
      >
        CAD <span className="hero-accent-text">Studio</span>
      </motion.h1>

      {/* Positioned on NURBS rather than on manufacturability. Every other AI
          3D tool outputs meshes; native .3dm NURBS is the real differentiator
          and the thing a jeweler's CAD person actually checks for. It is also
          the claim that stays true on every run: the pipeline reports
          not_all_solid on some geometry, so a blanket "manufacturable" promise
          here would be contradicted at the caster. Solidity is surfaced
          per-result in the workspace instead. */}
      <motion.p
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="max-w-[36ch] sm:max-w-none text-center font-mono text-[9px] sm:text-[10px] md:text-[11px] uppercase tracking-[0.15em] leading-relaxed text-muted-foreground mb-6 md:mb-8"
      >
        True NURBS ring CAD. Native Rhino .3dm.
      </motion.p>

      {/* Feature Cards */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="w-full max-w-[1200px] grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5 lg:gap-6 pb-6 md:pb-10"
      >
        {cadFeatures.map((feature) => {
          const Icon = feature.icon;

          if (feature.comingSoon) {
            return (
              <div
                key={feature.title}
                className="group relative marta-frame overflow-hidden aspect-[4/3] opacity-60 cursor-default"
              >
                <img
                  src={feature.image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

                <div className="absolute top-2.5 left-2.5">
                  <Icon className="w-4 h-4 text-formanova-hero-accent/60" />
                </div>

                <div className="absolute top-2.5 right-2.5">
                  <span className="font-mono text-[7px] tracking-[0.2em] text-muted-foreground uppercase bg-muted/80 backdrop-blur-sm px-2 py-0.5">
                    Coming Soon
                  </span>
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-4 md:p-5">
                  <h2 className="font-display text-2xl md:text-3xl lg:text-[40px] uppercase tracking-wide text-white leading-none">
                    {feature.title}
                  </h2>
                  <p className="font-mono text-[8px] md:text-[9px] tracking-[0.15em] text-white/60 uppercase mt-2">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          }

          return (
            <motion.button
              key={feature.title}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => navigate(feature.route)}
              className="group relative marta-frame overflow-hidden aspect-[4/3] cursor-pointer text-left transition-all duration-300 hover:border-formanova-hero-accent hover:shadow-[0_0_30px_-5px_hsl(var(--formanova-hero-accent)/0.4)]"
            >
              <img
                src={feature.image}
                alt={feature.title}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

              <div className="absolute top-2.5 left-2.5">
                <Icon className="w-4 h-4 text-formanova-hero-accent" />
              </div>

              <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                <div className="w-6 h-6 flex items-center justify-center bg-formanova-hero-accent shadow-lg shadow-formanova-hero-accent/30">
                  <ArrowRight className="w-3 h-3 text-primary-foreground" />
                </div>
              </div>

              <div className="absolute bottom-0 left-0 right-0 p-4 md:p-5">
                <h2 className="font-display text-2xl md:text-3xl lg:text-[40px] uppercase tracking-wide text-white leading-none transition-transform duration-300 group-hover:translate-x-0.5">
                  {feature.title}
                </h2>
                <p className="font-mono text-[8px] md:text-[9px] tracking-[0.15em] text-white/60 uppercase mt-2">
                  {feature.description}
                </p>
              </div>
            </motion.button>
          );
        })}
      </motion.div>
    </div>
    </>
  );
}
