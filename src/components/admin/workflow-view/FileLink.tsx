import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { authenticatedFetch } from '@/lib/authenticated-fetch';
import type { ViewFile } from '@/lib/admin-workflow-views';

function formatBytes(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const EXT: Record<string, string> = { '3DM': '3dm', GLB: 'glb', STL: 'stl', STEP: 'step', 'Spec sheet': 'pdf', Meshes: 'bin.gz' };

function downloadName(file: ViewFile, fallbackStem: string): string {
  if (file.name) return file.name.replace(/[\\/:*?"<>|]+/g, '-');
  const kind = Object.keys(EXT).find((k) => file.label.includes(k));
  const stem = `${fallbackStem}-${file.label}`.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-');
  return kind ? `${stem}.${EXT[kind]}` : stem;
}

function save(blobUrl: string, name: string) {
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Download button for a stored file. /api/artifacts/<sha> is auth-gated, so the bytes are
 * fetched with the admin's token and saved from a blob; a data: url is saved directly.
 * The url was already restricted to http(s) / same-origin / data: by the extractor.
 */
export function FileLink({ file, fallbackStem }: { file: ViewFile; fallbackStem: string }) {
  const [busy, setBusy] = useState(false);
  const size = formatBytes(file.bytes);
  const name = downloadName(file, fallbackStem);

  async function onClick() {
    if (busy) return;
    if (file.url.startsWith('data:')) {
      save(file.url, name);
      return;
    }
    setBusy(true);
    try {
      const response = await authenticatedFetch(file.url);
      if (!response.ok) throw new Error(`${response.status}`);
      const blob = await response.blob();
      if (blob.size === 0) throw new Error('empty file');
      const blobUrl = URL.createObjectURL(blob);
      save(blobUrl, name);
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
      disabled={busy}
      aria-label={`Download ${file.label}${file.name ? ` ${file.name}` : ''}${size ? ` ${size}` : ''}`}
      className="inline-flex max-w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted/40 disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Download className="h-4 w-4 shrink-0" />}
      <span className="font-medium">{file.label}</span>
      {file.name && <span className="truncate text-muted-foreground">{file.name}</span>}
      {size && <span className="shrink-0 font-mono text-xs text-muted-foreground">{size}</span>}
    </button>
  );
}

export function FileList({ files, fallbackStem }: { files: ViewFile[]; fallbackStem: string }) {
  if (!files.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((file) => <FileLink key={file.url} file={file} fallbackStem={fallbackStem} />)}
    </div>
  );
}
