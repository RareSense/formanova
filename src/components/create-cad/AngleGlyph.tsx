/**
 * Thin-line glyph for a camera view: a box seen from that side, with the
 * face the camera looks at filled. Close-ups get a magnifier; anything else
 * (the customer's own words) gets a camera.
 */
export default function AngleGlyph({ view, className = "" }: { view: string; className?: string }) {
  const v = view.toLowerCase();
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  const face = { fill: "hsl(var(--formanova-hero-accent) / 0.25)", stroke: "currentColor", strokeWidth: 1 };

  let body: JSX.Element;
  if (v.includes("close")) {
    body = (<><circle cx="20" cy="20" r="11" {...common} /><path d="M28 28l10 10" {...common} /><circle cx="20" cy="20" r="4" {...face} /></>);
  } else if (v.startsWith("top") || v.includes("above")) {
    body = (<><rect x="10" y="10" width="28" height="28" {...face} /><path d="M24 2v6M21 5l3 3 3-3" {...common} /></>);
  } else if (v.startsWith("side")) {
    body = (<><path d="M14 12l12-6v28l-12 6z" {...face} /><path d="M26 6l10 5v28l-10-5" {...common} /><path d="M2 24h8M7 21l3 3-3 3" {...common} /></>);
  } else if (v.startsWith("back") || v.includes("under")) {
    body = (<><rect x="12" y="12" width="24" height="24" {...common} strokeDasharray="2 2" /><rect x="16" y="16" width="24" height="24" {...face} /><path d="M46 28h-4M44 25l-3 3 3 3" {...common} /></>);
  } else if (v.includes("three") || v.includes("quarter")) {
    body = (<><path d="M8 16l14-7 18 7-14 7z" {...common} /><path d="M8 16v16l18 7V23z" {...face} /><path d="M26 23l14-7v16l-14 7" {...common} /></>);
  } else {
    body = (<><rect x="8" y="16" width="32" height="22" rx="2" {...common} /><circle cx="24" cy="27" r="6" {...face} /><path d="M18 16l3-5h6l3 5" {...common} /></>);
  }
  return <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>{body}</svg>;
}
