import { useOptionalAuth } from '@/contexts/AuthContext';
import { cadGenerateWorkflowFor } from '@/lib/ring-cad-nurbs-api';

/** The generate workflow the signed-in user's new CAD runs start (see cadGenerateWorkflowFor). */
export function useCadGenerateWorkflow(): string {
  return cadGenerateWorkflowFor(useOptionalAuth()?.user?.email);
}
