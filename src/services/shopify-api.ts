import { authenticatedFetch } from '@/lib/authenticated-fetch';

export interface ShopifyStatus {
  connected: boolean;
  shop_domain?: string;
  shop_name?: string;
  auto_suggest?: boolean;
  last_used_at?: string | null;
}

export interface ShopifySuggestResult {
  title: string;
  description: string;
  alt_text: string;
  error?: string;
}

export interface ShopifyExportResult {
  success?: boolean;
  product_id?: string;
  shopify_admin_url?: string;
  error?: string;
}

export async function getShopifyStatus(): Promise<ShopifyStatus> {
  const res = await authenticatedFetch('/api/shopify/status');
  if (!res.ok) {
    if (res.status === 404 || res.status === 409) {
      return { connected: false };
    }
    throw new Error('Failed to fetch Shopify status');
  }
  return res.json();
}

export async function initiateShopifyConnect(subdomain: string): Promise<string> {
  const res = await authenticatedFetch('/api/shopify/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shop: `${subdomain}.myshopify.com` }),
  });
  if (!res.ok) throw new Error('Failed to initiate Shopify connect');
  const data = await res.json();
  return data.install_url;
}

export async function disconnectShopify(): Promise<{ disconnected: true }> {
  const res = await authenticatedFetch('/api/shopify/disconnect', { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to disconnect Shopify');
  return res.json();
}

export async function updateShopifySettings(autoSuggest: boolean): Promise<{ auto_suggest: boolean }> {
  const res = await authenticatedFetch('/api/shopify/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auto_suggest: autoSuggest }),
  });
  if (!res.ok) throw new Error('Failed to update Shopify settings');
  return res.json();
}

export async function suggestShopifyMetadata(assetId: string, workflowId?: string | null): Promise<ShopifySuggestResult> {
  const res = await authenticatedFetch('/api/shopify/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      asset_id: assetId,
      ...(workflowId ? { workflow_id: workflowId } : {}),
    }),
    signal: AbortSignal.timeout(35_000),
  });
  if (!res.ok) throw new Error('Failed to get AI suggestions');
  return res.json();
}

export async function exportToShopify(params: {
  assetId: string;
  title: string;
  description: string;
  altText: string;
}): Promise<ShopifyExportResult> {
  const res = await authenticatedFetch('/api/shopify/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      asset_id: params.assetId,
      title: params.title,
      description: params.description,
      alt_text: params.altText,
    }),
  });
  if (!res.ok) throw new Error('Failed to export to Shopify');
  return res.json();
}
