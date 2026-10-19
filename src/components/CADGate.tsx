import { CadServiceDownNotice, CadServiceDownPopup } from '@/components/CadServiceDownPopup';
import { CAD_SERVICE_DOWN } from '@/lib/cad-service-status';

export function CADGate({ children }: { children: React.ReactNode }) {
  if (!CAD_SERVICE_DOWN) return <>{children}</>;
  return (
    <>
      <CadServiceDownNotice />
      <CadServiceDownPopup />
      {children}
    </>
  );
}
