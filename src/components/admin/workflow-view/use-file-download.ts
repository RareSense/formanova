import { useState } from 'react';
import { toast } from 'sonner';

import { authenticatedFetch } from '@/lib/authenticated-fetch';

export interface FileRef {
  label: string;
  url: string;
  name: string | null;
  bytes: number | null;
  ext?: string | null;
}

export function formatBytes(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function downloadName(file: FileRef, fallbackStem: string): string {
  if (file.name) {
    const printable = Array.from(file.name).map((ch) => (ch.charCodeAt(0) < 0x20 ? '-' : ch)).join('');
    return printable.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 120);
  }
  const stem = `${fallbackStem}-${file.label}`.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 100);
  return file.ext ? `${stem}.${file.ext.replace(/[^a-z0-9]/gi, '')}` : stem;
}

/**
 * Only same-origin paths are fetched with the admin's token: authenticatedFetch attaches the
 * Bearer token to whatever url it is given, so a cross-origin url must never reach it.
 */
export const isSameOrigin = (url: string) => url.startsWith('/') && !url.startsWith('//');

/** An https link that may be opened (with no token, no referrer) for a file on another host. */
export const externalHref = (url: string) => (/^https?:\/\//i.test(url) ? url : null);

/**
 * Saves a same-origin, auth-gated file (/api/artifacts/<sha>) from a blob fetched with the
 * admin's token. Callers only offer this for same-origin urls (isSameOrigin).
 */
export function useFileDownload(file: FileRef, fallbackStem: string) {
  const [busy, setBusy] = useState(false);
  const name = downloadName(file, fallbackStem);

  async function download() {
    if (busy || !isSameOrigin(file.url)) return;
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

  return { busy, download, name };
}
