import { Navigate } from 'react-router-dom';
import { CAD_USER_FACING_HIDDEN } from '@/lib/feature-flags';

export function CADGate({ children }: { children: React.ReactNode }) {
  if (CAD_USER_FACING_HIDDEN) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
