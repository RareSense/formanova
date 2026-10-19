import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CAD_DOWN_MESSAGE, CAD_DOWN_TITLE, onCadDownPopup } from '@/lib/cad-service-status';

/** The popup shown whenever someone tries to start CAD work while CAD_SERVICE_DOWN is on. */
export function CadServiceDownPopup() {
  const [open, setOpen] = useState(false);
  useEffect(() => onCadDownPopup(() => setOpen(true)), []);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{CAD_DOWN_TITLE}</AlertDialogTitle>
          <AlertDialogDescription>{CAD_DOWN_MESSAGE}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction>OK</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** A slim notice across the top of every CAD page while CAD_SERVICE_DOWN is on. */
export function CadServiceDownNotice() {
  return (
    <div role="status" className="w-full border-b border-border bg-muted/60 px-5 py-3 md:px-8">
      <div className="mx-auto max-w-3xl">
        <p className="font-display text-sm uppercase tracking-wider text-foreground">{CAD_DOWN_TITLE}</p>
        <p className="text-xs text-muted-foreground md:text-sm">{CAD_DOWN_MESSAGE}</p>
      </div>
    </div>
  );
}
