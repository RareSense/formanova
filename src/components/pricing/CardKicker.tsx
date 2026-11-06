/** Small italic line on top of every pricing card: which way of buying it is ("Do it yourself" / "We do it for you"). */
export function CardKicker({ gold, children }: { gold?: boolean; children: string }) {
  return (
    <p
      className={`mb-3 font-mono text-xs font-bold italic uppercase tracking-[0.15em] ${
        gold ? 'text-[hsl(var(--formanova-hero-accent))]' : 'text-muted-foreground'
      }`}
    >
      {children}
    </p>
  );
}
