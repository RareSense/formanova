import { Download, Loader2 } from 'lucide-react';

import { externalHref, formatBytes, isSameOrigin, useFileDownload, type FileRef } from './use-file-download';

export type { FileRef } from './use-file-download';

/**
 * Download button for a stored file. /api/artifacts/<sha> is auth-gated, so the bytes are
 * fetched with the admin's token and saved from a blob. A file on another host is a plain
 * link (no token, no referrer) marked as external.
 */
export function FileLink({ file, fallbackStem, path }: { file: FileRef; fallbackStem: string; path?: string }) {
  const { busy, download } = useFileDownload(file, fallbackStem);
  const size = formatBytes(file.bytes);
  const kind = file.ext ? file.ext.toUpperCase() : null;

  if (!isSameOrigin(file.url)) {
    const href = externalHref(file.url);
    return (
      <span data-path={path} className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm">
        <span className="font-medium">{file.label}</span>
        {kind && <span className="shrink-0 rounded bg-muted px-1 font-mono text-[10px]">{kind}</span>}
        <span className="text-[11px] text-amber-600 dark:text-amber-400">External file, open at your own risk:</span>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline">{href}</a>
        ) : (
          <span className="break-all text-muted-foreground">{file.url}</span>
        )}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
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
