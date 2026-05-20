export function normalizeShopifySubdomain(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

export function isValidShopifySubdomain(value: string): boolean {
  return /^[a-z0-9-]+$/.test(value);
}

export function formatRelativeShopifyTime(value?: string | null): string {
  if (!value) return 'Never';

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'Never';

  const diffMs = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < hour) {
    const minutes = Math.max(1, Math.round(diffMs / minute));
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  if (diffMs < day) {
    const hours = Math.max(1, Math.round(diffMs / hour));
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.max(1, Math.round(diffMs / day));
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
