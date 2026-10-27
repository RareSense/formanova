/**
 * Asked once per Generate press when a CAD from Image has a single photo: one view leaves the
 * other sides to guesswork, and more angles are the cheapest way to a closer model. Adding photos
 * is the suggested choice (the main button); continuing is always one press away.
 */
import { useRef } from 'react';
import { Camera } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function OnePhotoConfirm({ open, onAddPhotos, onContinue }: {
  open: boolean;
  /** Close and go back to the upload, to add more angles. */
  onAddPhotos: () => void;
  /** Make the CAD from the one photo anyway. */
  onContinue: () => void;
}) {
  const addRef = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) onAddPhotos(); }}>
      <AlertDialogContent
        className="w-[calc(100%-2rem)] max-w-md"
        // Focus the suggested choice, so Enter adds photos rather than continuing with one.
        onOpenAutoFocus={(event) => { event.preventDefault(); addRef.current?.focus(); }}
      >
        <AlertDialogHeader className="items-center text-center sm:text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Camera className="h-5 w-5 text-foreground" aria-hidden="true" />
          </div>
          <AlertDialogTitle className="font-display text-2xl tracking-wide">Only one photo?</AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed">
            One photo shows only one side of your piece, so the rest has to be guessed. Add two or three photos from
            different angles (front, side, top) and the CAD will match much more closely.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:justify-center sm:gap-2">
          <AlertDialogCancel className="mt-0 h-10 px-6 sm:w-48" onClick={onContinue}>
            Continue with 1 photo
          </AlertDialogCancel>
          <AlertDialogAction ref={addRef} className="h-10 px-6 sm:w-48" onClick={onAddPhotos}>
            Add more photos
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
