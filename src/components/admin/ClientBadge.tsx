import { Badge } from '@/components/ui/badge';
import { clientLabel } from '@/lib/admin-client-label';

/** Small "Rhino 0.6.2" badge; renders nothing for untagged runs. */
export function ClientBadge({ client, version }: { client?: string | null; version?: string | null }) {
  const label = clientLabel(client, version);
  if (!label) return null;
  return (
    <Badge variant="outline" className="shrink-0 whitespace-nowrap">
      {label}
    </Badge>
  );
}
