import { useState, useRef } from 'react';
import { Loader2, Upload, FileText } from 'lucide-react';
import { uploadBrandBook, deleteBrandBook } from '@/lib/brand-profile-api';

const BRAND_BOOK_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp';

/**
 * Compact brand book upload row for the onboarding popup. Uploads
 * immediately (the endpoint sets the profile field server-side) and owns
 * all of its own state.
 */
export function BrandBookUpload() {
  const [filename, setFilename] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    const result = await uploadBrandBook(file);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!result.ok) {
      setError(result.error ?? 'Upload failed. Please try again.');
      return;
    }
    setFilename(result.filename ?? file.name);
  };

  const handleRemove = async () => {
    setRemoving(true);
    setError(null);
    const message = await deleteBrandBook();
    setRemoving(false);
    if (message) { setError(message); return; }
    setFilename(null);
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={BRAND_BOOK_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUpload(file);
        }}
      />
      {filename ? (
        <div className="flex items-center gap-3 border border-border px-4 py-3">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{filename}</span>
          <button
            type="button"
            onClick={() => void handleRemove()}
            disabled={removing}
            className="shrink-0 text-sm font-medium text-foreground hover:text-destructive transition-colors"
          >
            {removing ? 'Removing…' : 'Remove'}
          </button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
          className="flex cursor-pointer items-center gap-2.5 border border-dashed border-border px-4 py-3.5 hover:border-foreground transition-colors"
        >
          {uploading
            ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-foreground" />
            : <Upload className="h-4 w-4 shrink-0 text-foreground" />}
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
            {uploading ? 'Uploading…' : 'Upload brand guidelines'}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">PDF, PNG or JPG · Max 20 MB</span>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </>
  );
}
