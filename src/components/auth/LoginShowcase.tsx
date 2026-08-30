import loginShowcaseBefore from '@/assets/examples/login-showcase-before.webp';
import loginShowcaseAfter from '@/assets/examples/login-showcase-after.webp';

export default function LoginShowcase() {
  return (
    <div className="mb-8 w-full max-w-md">
      <p className="mb-4 text-center text-lg font-display text-foreground">
        See what FormaNova does with a real photo
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <div className="aspect-square w-full overflow-hidden border border-border bg-muted/10">
            <img
              src={loginShowcaseBefore}
              alt="Jewelry piece before AI photoshoot"
              className="h-full w-full object-contain"
            />
          </div>
          <p className="text-center text-[11px] font-medium text-muted-foreground">
            Your photo
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <div className="aspect-square w-full overflow-hidden border border-border bg-muted/10">
            <img
              src={loginShowcaseAfter}
              alt="Model wearing the jewelry after AI photoshoot"
              className="h-full w-full object-contain"
            />
          </div>
          <p className="text-center text-[11px] font-medium text-muted-foreground">
            AI result
          </p>
        </div>
      </div>
    </div>
  );
}
