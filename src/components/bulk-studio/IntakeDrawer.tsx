/**
 * Smart Intake Drawer: Upload New | Past Jewelry.
 * Right sheet on md+, full-width bottom sheet on mobile.
 */
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsMobile } from '@/hooks/use-mobile';
import type { ShotAngle } from '@/lib/shot-list';
import type { ShotListApi } from '@/hooks/useShotList';
import { IntakeUploadTab } from './IntakeUploadTab';
import { IntakePastTab } from './IntakePastTab';

export type IntakeTab = 'upload' | 'past';

interface IntakeDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: IntakeTab;
  onTabChange: (t: IntakeTab) => void;
  staging: ShotListApi;
  jewelryType: string;
  jewelryLabel: string;
  onAddPieces: (pieces: ShotAngle[][]) => void;
}

export function IntakeDrawer({
  open, onOpenChange, tab, onTabChange, staging, jewelryType, jewelryLabel, onAddPieces,
}: IntakeDrawerProps) {
  const isMobile = useIsMobile();
  const add = (pieces: ShotAngle[][]) => { onAddPieces(pieces); onOpenChange(false); };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={`flex flex-col gap-0 p-0 ${isMobile ? 'h-[92dvh]' : 'h-dvh w-full sm:max-w-xl'}`}
      >
        <SheetHeader className="border-b border-border px-4 md:px-6 py-4 text-left">
          <SheetTitle className="font-display text-2xl uppercase tracking-wide">Add Jewelry</SheetTitle>
          <SheetDescription className="font-mono text-[10px] uppercase tracking-wider">
            {jewelryLabel} · up to 3 angles per piece
          </SheetDescription>
        </SheetHeader>

        <Tabs value={tab} onValueChange={(v) => onTabChange(v as IntakeTab)} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-4 md:mx-6 mt-4 grid h-10 grid-cols-2">
            <TabsTrigger value="upload" className="font-mono text-[10px] uppercase tracking-wider">Upload New</TabsTrigger>
            <TabsTrigger value="past" className="font-mono text-[10px] uppercase tracking-wider">Past Jewelry</TabsTrigger>
          </TabsList>
          <TabsContent value="upload" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
            <IntakeUploadTab staging={staging} onAdd={add} />
          </TabsContent>
          <TabsContent value="past" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
            <IntakePastTab jewelryType={jewelryType} onAdd={add} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
