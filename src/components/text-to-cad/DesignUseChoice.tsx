export type DesignUse = "as_is" | "edit";

const OPTIONS: { value: DesignUse; title: string; description: string }[] = [
  { value: "as_is", title: "Use as is", description: "Create the CAD to match the uploaded piece." },
  { value: "edit", title: "Edit before CAD", description: "Change stone, metal, or details and preview it first." },
];

/**
 * Image to CAD, once a picture is uploaded: make the CAD from it as it is, or
 * edit the design first (opens the design editor). A radio group, so it works
 * with arrow keys and screen readers like any other choice.
 */
export default function DesignUseChoice({ value, onChange, disabled }: { value: DesignUse; onChange: (v: DesignUse) => void; disabled?: boolean }) {
  return (
    <fieldset className="flex-shrink-0" disabled={disabled}>
      <legend className="text-[15px] font-semibold text-foreground">How should we use this design?</legend>
      <div role="radiogroup" aria-label="How should we use this design?" className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {OPTIONS.map(({ value: v, title, description }) => {
          const selected = value === v;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(v)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowUp") {
                  e.preventDefault();
                  onChange(v === "as_is" ? "edit" : "as_is");
                }
              }}
              className={`flex items-center gap-4 border px-4 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--formanova-hero-accent))] disabled:opacity-60 ${
                selected
                  ? "border-[hsl(var(--formanova-hero-accent))] bg-[hsl(var(--formanova-hero-accent)/0.06)]"
                  : "border-border bg-background hover:border-foreground/40"
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-foreground" : "border-border"}`}
              >
                {selected && <span className="h-2.5 w-2.5 rounded-full bg-foreground" />}
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-medium text-foreground">{title}</span>
                <span className="block text-sm text-muted-foreground">{description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
