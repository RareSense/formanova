import ThemedCadPicture from "./ThemedCadPicture";

export interface CatalogStory {
  /** The Rhino capture, as theme-coloured layers. */
  cad: { shade: string; metal: string; gems: string };
  /** The product picture it becomes. */
  photo: string;
}

const label = "absolute left-1.5 top-1.5 z-10 bg-background/85 px-1 font-mono text-[7px] uppercase tracking-[0.14em] text-muted-foreground sm:text-[8px]";

/** Dashboard card picture for Product Shot from CAD: the CAD, an arrow, the catalog photo (CadStoryPicture, the other way round). */
export default function CatalogStoryPicture({ story }: { story: CatalogStory }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-muted/20 p-3 sm:gap-3 sm:p-4">
      <div className="relative h-full flex-1 overflow-hidden border border-border/70">
        <span className={label}>Your CAD</span>
        <ThemedCadPicture {...story.cad} className="h-full w-full p-1.5 pt-4" />
      </div>
      <span aria-hidden="true" className="relative h-px w-3 flex-shrink-0 bg-[hsl(var(--formanova-hero-accent))] after:absolute after:-right-px after:-top-[3px] after:border-y-[3.5px] after:border-l-[6px] after:border-y-transparent after:border-l-[hsl(var(--formanova-hero-accent))] sm:w-5" />
      <div className="relative h-full flex-1 overflow-hidden border border-border/70 bg-white">
        <span className={label}>Product shot</span>
        <img src={story.photo} alt="" draggable={false} className="h-full w-full object-cover" />
      </div>
    </div>
  );
}
