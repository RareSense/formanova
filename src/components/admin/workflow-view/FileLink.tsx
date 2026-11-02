import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { authenticatedFetch } from '@/lib/authenticated-fetch';

export interface FileRef {
  label: string;
  url: string;
  name: string | null;
  bytes: number | null;
  ext?: string | null;
}

function formatBytes(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function downloadName(file: FileRef, fallbackStem: string): string {
  if (file.name) {
    const printable = Array.from(file.name).map((ch) => (ch.charCodeAt(0) < 0x20 ? '-' : ch)).join('');
    return printable.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 120);
  }
  const stem = `${fallbackStem}-${file.label}`.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 100);
  return file.ext ? `${stem}.${file.ext.replace(/[^a-z0-9]/gi, '')}` : stem;
}

/** Same-origin paths and http(s) only; anything else is not fetched (url-safety.ts already refused it). */
const fetchable = (url: string) => (url.startsWith('/') && !url.startsWith('//')) || /^https?:\/\//i.test(url);

/**
 * Download button for a stored file. /api/artifacts/<sha> is auth-gated, so the bytes are
 * fetched with the admin's token and saved from a blob.
 */
export function FileLink({ file, fallbackStem, path }: { file: FileRef; fallbackStem: string; path?: string }) {
  const [busy, setBusy] = useState(false);
  const size = formatBytes(file.bytes);
  const name = downloadName(file, fallbackStem);
  const kind = file.ext ? file.ext.toUpperCase() : null;

  async function onClick() {
    if (busy || !fetchable(file.url)) return;
    setBusy(true);
    try {
      const response = await authenticatedFetch(file.url);
      if (!response.ok) throw new Error(`${response.status}`);
      const blob = await response.blob();
      if (blob.size === 0) throw new Error('empty file');
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } catch (error) {
      console.error('[Admin file download]', file.label, error);
      toast.error(`Could not download ${file.label} (${error instanceof Error ? error.message : 'error'})`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || !fetchable(file.url)}
      data-path={path}
      aria-label={`Download ${file.label}${file.name ? ` ${file.name}` : ''}${size ? ` ${size}` : ''}`}
      className="inline-flex max-w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted/40 disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Download className="h-4 w-4 shrink-0" />}
      <span className="font-medium">{file.label}</span>
      {kind && <span className="shrink-0 rounded bg-muted px-1 font-mono text-[10px]">{kind}</span>}
      {file.name && <span className="truncate text-muted-foreground">{file.name}</span>}
      {size && <span className="shrink-0 font-mono text-xs text-muted-foreground">{size}</span>}
    </button>
  );
}
