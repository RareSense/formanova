import { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';

/**
 * Two-step "Delete my details" action shown under the confidential note on
 * the Brand Settings page. The caller clears the profile and reports an
 * error message (or null) back.
 */
export function DeleteBrandDetails({ onDelete }: { onDelete: () => Promise<string | null> }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    const message = await onDelete();
    setDeleting(false);
    if (message) { setError(message); return; }
    setConfirming(false);
  };

  return (
    <div className="flex flex-col items-end pt-1">
      {confirming ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="text-sm text-foreground">Delete all brand details? This cannot be undone.</p>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 border border-destructive px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {deleting ? 'Deleting…' : 'Delete permanently'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={deleting}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-destructive hover:opacity-70 transition-opacity"
        >
          <Trash2 className="h-4 w-4" />
          Delete my details
        </button>
      )}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
