import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BookOpen, ExternalLink, Loader2, Search, Store } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PaginationBar } from '@/components/generations/PaginationBar';
import {
  AdminBrandsApiError,
  listAdminBrands,
  STORE_PLATFORMS,
  type AdminBrandListItem,
} from '@/lib/admin-brands-api';

const PAGE_SIZE = 20;

const PLATFORM_LABELS: Record<string, string> = {
  shopify: 'Shopify',
  etsy: 'Etsy',
  woocommerce: 'WooCommerce',
  bigcommerce: 'BigCommerce',
  wix: 'Wix',
  squarespace: 'Squarespace',
  magento: 'Magento',
  webflow: 'Webflow',
  unknown: 'Unknown',
};

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function HostLink({ url }: { url: string | null }) {
  if (!url) return <span className="text-muted-foreground">-</span>;
  let host = url;
  try {
    host = new URL(url).hostname.replace('www.', '');
  } catch { /* show raw value */ }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-primary hover:opacity-80 transition-opacity"
    >
      {host}
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}

function NotAuthorizedState() {
  return (
    <div className="border border-border bg-card">
      <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <AlertTriangle className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-2xl tracking-wide">Not Authorized</h2>
          <p className="text-sm text-muted-foreground">
            Your account is authenticated, but the backend did not authorize access to admin brands.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AdminBrandsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');

  const search = searchParams.get('search') ?? '';
  const platform = searchParams.get('platform') ?? '';
  const hasBrand = searchParams.get('has_brand') ?? '';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSearchParams(next, { replace: true });
  };

  const queryParams = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      search: search || undefined,
      platform: platform || undefined,
      has_brand: hasBrand === '' ? undefined : hasBrand === 'true',
    }),
    [search, platform, hasBrand, page],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-brands', queryParams],
    queryFn: () => listAdminBrands(queryParams),
  });

  if (error instanceof AdminBrandsApiError && (error.status === 401 || error.status === 403)) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8">
        <NotAuthorizedState />
      </div>
    );
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 space-y-6">

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setParam('search', searchInput.trim());
          }}
        >
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search email, brand, website, or store"
            className="pl-9"
          />
        </form>

        <Select value={platform || 'all'} onValueChange={(v) => setParam('platform', v === 'all' ? '' : v)}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            {STORE_PLATFORMS.map((p) => (
              <SelectItem key={p} value={p}>{PLATFORM_LABELS[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={hasBrand || 'all'} onValueChange={(v) => setParam('has_brand', v === 'all' ? '' : v)}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Brand status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            <SelectItem value="true">Has brand info</SelectItem>
            <SelectItem value="false">No brand info</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="border border-border bg-card px-6 py-10 text-center">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : 'Failed to load brands.'}
          </p>
          <Button
            variant="outline"
            className="mt-4 h-9 px-4 font-mono text-[10px] uppercase tracking-[0.2em]"
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {data?.total ?? 0} user{(data?.total ?? 0) === 1 ? '' : 's'}
          </p>

          <div className="border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Based in</TableHead>
                  <TableHead>Markets</TableHead>
                  <TableHead>Book</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.items ?? []).map((item: AdminBrandListItem) => (
                  <TableRow key={item.user_id}>
                    <TableCell className="whitespace-nowrap text-sm">{item.email}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {item.brand_name ?? <span className="text-muted-foreground italic">Not set</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm"><HostLink url={item.website_url} /></TableCell>
                    <TableCell className="whitespace-nowrap text-sm"><HostLink url={item.store_url} /></TableCell>
                    <TableCell className="whitespace-nowrap">
                      {item.store_platform ? (
                        <Badge variant={item.store_platform === 'unknown' ? 'outline' : 'secondary'} className="gap-1">
                          <Store className="h-3 w-3" />
                          {PLATFORM_LABELS[item.store_platform] ?? item.store_platform}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {item.based_in ?? <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.target_markets.length
                        ? item.target_markets.join(', ')
                        : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell>
                      {item.brand_book_asset_id
                        ? <BookOpen className="h-4 w-4 text-primary" aria-label="Brand book uploaded" />
                        : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDateTime(item.brand_updated_at)}
                    </TableCell>
                  </TableRow>
                ))}
                {(data?.items ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                      No users match these filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <PaginationBar
            currentPage={page}
            totalPages={totalPages}
            onPageChange={(p) => setParam('page', String(p))}
          />
        </>
      )}
    </div>
  );
}
