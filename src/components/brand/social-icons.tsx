import { Link2 } from 'lucide-react';

export type SocialIconComponent = (props: { className?: string }) => JSX.Element;

export function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2.16c3.2 0 3.58.01 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.64.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85C2.38 3.92 3.9 2.38 7.15 2.23 8.42 2.17 8.8 2.16 12 2.16ZM12 0C8.74 0 8.33.01 7.05.07 2.7.27.27 2.69.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.2 4.36 2.62 6.78 6.98 6.98 1.28.06 1.69.07 4.95.07s3.67-.01 4.95-.07c4.35-.2 6.78-2.62 6.98-6.98.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95C23.73 2.7 21.31.27 16.95.07 15.67.01 15.26 0 12 0Zm0 5.84A6.16 6.16 0 1 0 18.16 12 6.16 6.16 0 0 0 12 5.84Zm0 10.15A4 4 0 1 1 16 12a4 4 0 0 1-4 4Zm6.41-11.85a1.44 1.44 0 1 0 1.44 1.44 1.44 1.44 0 0 0-1.44-1.44Z" />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1Z" />
    </svg>
  );
}

function PinterestIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.48 2 12c0 4.24 2.64 7.87 6.36 9.33-.09-.79-.17-2.01.03-2.87.19-.78 1.2-5.06 1.2-5.06s-.31-.61-.31-1.52c0-1.42.83-2.48 1.85-2.48.87 0 1.3.66 1.3 1.44 0 .88-.56 2.2-.85 3.42-.24 1.02.51 1.85 1.52 1.85 1.82 0 3.22-1.92 3.22-4.7 0-2.46-1.77-4.18-4.29-4.18-2.92 0-4.64 2.19-4.64 4.46 0 .88.34 1.83.77 2.34.08.1.09.19.07.29-.08.31-.25 1.02-.28 1.16-.04.19-.15.23-.34.14-1.25-.58-2.03-2.41-2.03-3.88 0-3.16 2.29-6.06 6.62-6.06 3.47 0 6.17 2.48 6.17 5.79 0 3.45-2.18 6.23-5.2 6.23-1.02 0-1.97-.53-2.3-1.15l-.62 2.38c-.23.87-.84 1.97-1.25 2.64.94.29 1.94.45 2.97.45 5.52 0 10-4.48 10-10S17.52 2 12 2Z" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.99 3.66 9.13 8.44 9.88v-6.99H7.9V12h2.54V9.8c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.45 2.9h-2.33v6.99C18.34 21.13 22 16.99 22 12Z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15h7.59l5.24 6.93 6.07-6.93Zm-1.29 19.5h2.04L6.49 3.24H4.3l13.31 17.41Z" />
    </svg>
  );
}

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81ZM9.55 15.57V8.43L15.82 12l-6.27 3.57Z" />
    </svg>
  );
}

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13ZM7.12 20.45H3.55V9h3.57v11.45ZM22.23 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.46c.98 0 1.77-.77 1.77-1.72V1.72C24 .77 23.21 0 22.23 0Z" />
    </svg>
  );
}

const HOST_ICONS: [string, SocialIconComponent][] = [
  ['instagram.com', InstagramIcon],
  ['tiktok.com', TikTokIcon],
  ['pinterest.com', PinterestIcon],
  ['facebook.com', FacebookIcon],
  ['twitter.com', XIcon],
  ['x.com', XIcon],
  ['youtube.com', YouTubeIcon],
  ['linkedin.com', LinkedInIcon],
];

export function socialIconFor(url: string): SocialIconComponent {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    for (const [match, Icon] of HOST_ICONS) {
      if (host === match || host.endsWith(`.${match}`)) return Icon;
    }
  } catch { /* fall through */ }
  return Link2 as unknown as SocialIconComponent;
}

/** Pre-made empty slots shown in Social profiles until a link for that platform exists. */
export const PRESET_SOCIAL_PLATFORMS: {
  key: string;
  label: string;
  match: string;
  example: string;
  /** Host prefix a typed handle is appended to (e.g. "instagram.com/" + handle). */
  urlPrefix: string;
  Icon: SocialIconComponent;
}[] = [
  { key: 'instagram', label: 'Instagram', match: 'instagram.com', example: 'instagram.com/yourbrand', urlPrefix: 'instagram.com/', Icon: InstagramIcon },
  { key: 'tiktok', label: 'TikTok', match: 'tiktok.com', example: 'tiktok.com/@yourbrand', urlPrefix: 'tiktok.com/@', Icon: TikTokIcon },
  { key: 'pinterest', label: 'Pinterest', match: 'pinterest.com', example: 'pinterest.com/yourbrand', urlPrefix: 'pinterest.com/', Icon: PinterestIcon },
];

/** "@yourbrand", "instagram.com/yourbrand", or a full URL -> bare handle. */
export function extractHandle(value: string, match: string): string {
  let v = value.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  if (v.toLowerCase().startsWith(match)) v = v.slice(match.length);
  return v.replace(/^\//, '').replace(/^@/, '').replace(/\/+$/, '');
}

/** Bare handle -> full profile URL for a preset platform. */
export function handleToUrl(handle: string, urlPrefix: string): string {
  const h = extractHandle(handle, urlPrefix.replace(/\/@?$/, ''));
  return h ? `https://${urlPrefix}${h}` : '';
}

export function urlMatchesHost(url: string, match: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host === match || host.endsWith(`.${match}`);
  } catch {
    return false;
  }
}
