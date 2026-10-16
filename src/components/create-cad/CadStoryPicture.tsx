import ThemedCadPicture from "./ThemedCadPicture";

export interface CadStory {
  /** What the customer brings: a picture, or the words they typed. */
  input: { kind: "photo"; src: string; cover?: boolean } | { kind: "prompt"; text: string };
  inputLabel: string;
  /** The Rhino capture, as theme-coloured layers. */
  cad: { shade: string; metal: string; gems: string };
}

const label = "absolute left-1.5 top-1.5 z-10 bg-background/85 px-1 font-mono text-[7px] uppercase tracking-[0.14em] text-muted-foreground sm:text-[8px]";

/** Dashboard card picture: what goes in, an arrow, the real CAD it becomes. */
export default function CadStoryPicture({ story }: { story: CadStory }) {
  const { input } = story;
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-muted/20 p-3 sm:gap-3 sm:p-4">
      <div className="relative h-full flex-1 overflow-hidden border border-border/70 bg-white">
        <span className={label}>{story.inputLabel}</span>
        {input.kind === "photo" ? (
          <img src={input.src} alt="" draggable={false} className={`h-full w-full ${input.cover ? "object-cover" : "object-contain p-2 pt-5"}`} />
        ) : (
          <p className="line-clamp-4 px-2 pt-6 font-mono text-[9px] leading-snug text-zinc-800 sm:text-[11px]">
            {input.text}<span className="ml-0.5 inline-block h-[1em] w-px translate-y-[2px] bg-[hsl(var(--formanova-hero-accent))]" />
          </p>
        )}
      </div>
      <span aria-hidden="true" className="relative h-px w-3 flex-shrink-0 bg-[hsl(var(--formanova-hero-accent))] after:absolute after:-right-px after:-top-[3px] after:border-y-[3.5px] after:border-l-[6px] after:border-y-transparent after:border-l-[hsl(var(--formanova-hero-accent))] sm:w-5" />
      <div className="relative h-full flex-1 overflow-hidden border border-border/70">
        <span className={label}>NURBS CAD</span>
        <ThemedCadPicture {...story.cad} className="h-full w-full p-1.5 pt-4" />
      </div>
    </div>
  );
}
