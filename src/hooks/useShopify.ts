import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getStoredToken } from '@/lib/auth-api';
import { getShopifyStatus } from '@/services/shopify-api';

export const SHOPIFY_STATUS_QUERY_KEY = ['shopify-status'] as const;

export function useShopifyStatus() {
  return useQuery({
    queryKey: SHOPIFY_STATUS_QUERY_KEY,
    queryFn: getShopifyStatus,
    staleTime: 60_000,
    retry: 1,
    enabled: !!getStoredToken(),
  });
}

export function useInvalidateShopifyStatus() {
  const queryClient = useQueryClient();

  return () => queryClient.invalidateQueries({ queryKey: SHOPIFY_STATUS_QUERY_KEY });
}
