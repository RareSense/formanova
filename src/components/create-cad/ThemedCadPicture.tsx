import type { CSSProperties } from "react";

/**
 * A Rhino capture coloured by the active theme. `shade` is the grey render
 * (shading and wires); `metal` and `gems` are alpha masks of the same frame.
 * The theme's neutral tints the metal and its accent tints the gems, with
 * mix-blend-mode "color" so the shading and wires underneath are kept.
 */
export default function ThemedCadPicture({ shade, metal, gems, className = "" }: { shade: string; metal: string; gems: string; className?: string }) {
  const layer = (mask: string, colour: string): CSSProperties => ({
    backgroundColor: colour,
    WebkitMaskImage: `url(${mask})`,
    maskImage: `url(${mask})`,
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
    mixBlendMode: "color",
  });
  return (
    <div className={`isolate ${className.split(" ").includes("absolute") ? "" : "relative"} ${className}`} aria-hidden="true">
      <img src={shade} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain" />
      <div className="absolute inset-0" style={layer(metal, "hsl(var(--muted-foreground))")} />
      <div className="absolute inset-0" style={layer(gems, "hsl(var(--formanova-hero-accent))")} />
    </div>
  );
}
