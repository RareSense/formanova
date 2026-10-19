import { CadServiceDownNotice, CadServiceDownPopup } from '@/components/CadServiceDownPopup';
import { isCadServiceDown } from '@/lib/cad-service-status';

export function CADGate({ children }: { children: React.ReactNode }) {
  if (!isCadServiceDown()) return <>{children}</>;
  return (
    <>
      <CadServiceDownNotice />
      <CadServiceDownPopup />
      {children}
    </>
  );
}
