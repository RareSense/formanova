/** Small italic line on top of every pricing card: which way of buying it is ("Do it yourself" / "We do it for you").
 *  Owner, 2026-11-06: a little conspicuous, so bigger and darker than the plan name under it. */
export function CardKicker({ gold, children }: { gold?: boolean; children: string }) {
  return (
    <p
      className={`mb-3 whitespace-nowrap font-mono text-sm font-bold italic uppercase tracking-[0.12em] 2xl:text-[13px] 2xl:tracking-[0.08em] ${
        gold ? 'text-[hsl(var(--formanova-hero-accent))]' : 'text-foreground'
      }`}
    >
      {children}
    </p>
  );
}
