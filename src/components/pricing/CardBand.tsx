/** The band across the top of every pricing card: says at a glance which way of buying it is. */
export function CardBand({ id, tone, children }: { id?: string; tone: 'gold' | 'dark'; children: string }) {
  const colors = tone === 'gold' ? 'bg-[hsl(var(--formanova-hero-accent))] text-black' : 'bg-foreground text-background';
  return (
    <p
      id={id}
      className={`-mx-6 -mt-6 mb-6 px-6 py-2.5 text-center font-mono text-xs font-bold uppercase tracking-[0.2em] xl:-mx-8 xl:-mt-8 xl:px-8 ${colors}`}
    >
      {children}
    </p>
  );
}
