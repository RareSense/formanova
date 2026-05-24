import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getStoredToken } from '@/lib/auth-api';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { initializing } = useAuth();
  const location = useLocation();
  const token = getStoredToken();

  // Wait for session validation before rendering anything
  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Guard by token presence. User profile hydration can complete after mount.
  if (!token) {
    const destination = location.pathname + location.search + location.hash;
    return <Navigate to={`/login?redirect=${encodeURIComponent(destination)}`} replace />;
  }

  return <>{children}</>;
}
