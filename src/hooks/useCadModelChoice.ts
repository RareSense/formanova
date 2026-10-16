import { useState } from "react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import type { RingCadTier } from "@/lib/ring-cad-nurbs-api";

/**
 * The tier a CAD run uses. Admins pick it (see CadModelPicker); everyone
 * else always gets `fallback`, exactly as before.
 */
export function useCadModelChoice(fallback: RingCadTier) {
  const isAdmin = useIsAdmin();
  const [chosen, setChosen] = useState<RingCadTier>(fallback);
  return { isAdmin, tier: isAdmin ? chosen : fallback, setTier: setChosen };
}
