import ThemedCadPicture from "./ThemedCadPicture";

export interface CadStory {
  /** What the customer brings: a picture, or the words they typed. */
  input: { kind: "photo"; src: string; cover?: boolean } | { kind: "prompt"; text: string };
  /** Spoken name of the input, for screen readers. */
  inputLabel: string;
  /** The Rhino capture, as theme-coloured layers. */
  cad: { shade: string; metal: string; gems: string };
}

/**
 * Dashboard card picture, edge to edge: what goes in fills the left half, a
 * small gold arrow, the real CAD it becomes on a soft light ground on the right.
 */
export default function CadStoryPicture({ story }: { story: CadStory }) {
  const { input } = story;
  return (
    <div className="absolute inset-0 grid grid-cols-[1fr_auto_1fr] bg-white" role="img" aria-label={`${story.inputLabel} to NURBS CAD`}>
      <div className="relative overflow-hidden bg-white">
        {input.kind === "photo" ? (
          <img src={input.src} alt="" draggable={false}
            className={`h-full w-full ${input.cover ? "object-cover transition-transform duration-500 group-hover:scale-105" : "object-contain p-2"}`} />
        ) : (
          <p className="flex h-full items-center justify-center px-3 text-center font-serif text-sm italic leading-snug text-zinc-800 sm:text-base lg:text-[15px] xl:text-lg">
            “{input.text}”
          </p>
        )}
      </div>
      {/* The arrow has its own narrow column between the two pictures, so it never sits on either. */}
      <div aria-hidden="true" className="flex items-center justify-center px-1.5 sm:px-2">
        <span className="relative block h-px w-3 bg-[hsl(var(--formanova-hero-accent))] after:absolute after:-right-px after:-top-[3px] after:border-y-[3.5px] after:border-l-[6px] after:border-y-transparent after:border-l-[hsl(var(--formanova-hero-accent))] sm:w-4" />
      </div>
      <div className="relative overflow-hidden bg-muted/40">
        <ThemedCadPicture {...story.cad} className="h-full w-full p-2 sm:p-3" />
      </div>
    </div>
  );
}
