import { MapPin, Share2, Store } from 'lucide-react';

const INPUT_CLASS =
  'w-full border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-foreground';

export interface MissingBrandDetailsProps {
  showBasedIn: boolean;
  showTargetMarkets: boolean;
  showSocialLinks: boolean;
  showPhysicalLocation: boolean;
  basedIn: string;
  targetMarkets: string[];
  socialLinks: string[];
  physicalLocation: string;
  onBasedInChange: (value: string) => void;
  onTargetMarketsChange: (value: string[]) => void;
  onSocialLinksChange: (value: string[]) => void;
  onPhysicalLocationChange: (value: string) => void;
}

export function MissingBrandDetails({
  showBasedIn,
  showTargetMarkets,
  showSocialLinks,
  showPhysicalLocation,
  basedIn,
  targetMarkets,
  socialLinks,
  physicalLocation,
  onBasedInChange,
  onTargetMarketsChange,
  onSocialLinksChange,
  onPhysicalLocationChange,
}: MissingBrandDetailsProps) {
  if (!showBasedIn && !showTargetMarkets && !showSocialLinks && !showPhysicalLocation) return null;

  return (
    <section className="space-y-4 border border-border bg-muted/20 p-4 text-left">
      <div>
        <h3 className="text-sm font-medium text-foreground">A few details we could not confirm</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          These help Nova make recommendations around your real customers and visual language. Add only what applies. You can skip any field.
        </p>
      </div>

      {showBasedIn && (
        <label className="block space-y-1.5">
          <span className="flex items-center gap-2 text-xs font-medium text-foreground">
            <MapPin className="h-3.5 w-3.5" /> Where is your brand based?
          </span>
          <input
            aria-label="Where is your brand based?"
            value={basedIn}
            onChange={(event) => onBasedInChange(event.target.value)}
            placeholder="City, country"
            maxLength={80}
            className={INPUT_CLASS}
          />
        </label>
      )}

      {showTargetMarkets && (
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-foreground">Which markets matter most?</span>
          <input
            aria-label="Which markets matter most?"
            defaultValue={targetMarkets.join(', ')}
            onChange={(event) => onTargetMarketsChange(event.target.value.split(',').map((value) => value.trim()).filter(Boolean))}
            placeholder="India, UAE, United Kingdom"
            maxLength={160}
            className={INPUT_CLASS}
          />
        </label>
      )}

      {showSocialLinks && (
        <label className="block space-y-1.5">
          <span className="flex items-center gap-2 text-xs font-medium text-foreground">
            <Share2 className="h-3.5 w-3.5" /> Main social profile
          </span>
          <input
            aria-label="Main social profile"
            defaultValue={socialLinks.join(', ')}
            onChange={(event) => onSocialLinksChange(event.target.value.split(',').map((value) => value.trim()).filter(Boolean))}
            placeholder="instagram.com/yourbrand"
            maxLength={300}
            className={INPUT_CLASS}
          />
          <span className="block text-xs leading-relaxed text-muted-foreground">
            This helps Nova understand the content style you already use. It is optional.
          </span>
        </label>
      )}

      {showPhysicalLocation && (
        <label className="block space-y-1.5">
          <span className="flex items-center gap-2 text-xs font-medium text-foreground">
            <Store className="h-3.5 w-3.5" /> Physical store, if you have one
          </span>
          <input
            aria-label="Physical store, if you have one"
            value={physicalLocation}
            onChange={(event) => onPhysicalLocationChange(event.target.value)}
            placeholder="Street address or Google Maps link"
            maxLength={300}
            className={INPUT_CLASS}
          />
        </label>
      )}
    </section>
  );
}
