/**
 * Asked once per Generate press when a CAD from Image has a single photo. The picture does the
 * explaining: the user's own photo beside two empty slots for the angles it is missing, then one
 * short line. Adding photos is the suggested choice (focused); continuing is one press away.
 */
import { useRef } from 'react';
import { ImageOff } from 'lucide-react';

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

const MISSING_ANGLES = ['Side', 'Top'];

export default function OnePhotoConfirm({ open, photoUrl, onAddPhotos, onContinue }: {
  open: boolean;
  /** The one photo they uploaded, shown first. */
  photoUrl?: string | null;
  /** Close and go back to the upload, to add more angles. */
  onAddPhotos: () => void;
  /** Make the CAD from the one photo anyway. */
  onContinue: () => void;
}) {
  const addRef = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) onAddPhotos(); }}>
      <AlertDialogContent
        className="w-[calc(100%-2rem)] max-w-md shadow-none"
        // Focus the suggested choice, so Enter adds photos rather than continuing with one.
        onOpenAutoFocus={(event) => { event.preventDefault(); addRef.current?.focus(); }}
      >
        {/* Their photo, then the angles it is missing. Same size, one gap, so the row reads as a set. */}
        <div className="grid grid-cols-3 gap-3 pt-2" aria-hidden="true">
          <div className="aspect-square overflow-hidden border border-border bg-muted">
            {photoUrl ? (
              <img src={photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <ImageOff className="h-5 w-5" />
              </div>
            )}
          </div>
          {MISSING_ANGLES.map((angle) => (
            <div
              key={angle}
              className="flex aspect-square items-center justify-center border-2 border-dashed border-border font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
            >
              {angle}
            </div>
          ))}
        </div>
        <AlertDialogHeader className="items-center text-center sm:text-center">
          <AlertDialogTitle className="font-display text-2xl tracking-wide">Just one photo?</AlertDialogTitle>
          <AlertDialogDescription className="text-sm">
            Other sides are a guess. Add 2–3 angles for a closer match.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:justify-center sm:gap-2">
          <AlertDialogCancel className="mt-0 h-10 px-6 sm:w-44" onClick={onContinue}>
            Continue anyway
          </AlertDialogCancel>
          <AlertDialogAction ref={addRef} className="h-10 px-6 sm:w-44" onClick={onAddPhotos}>
            Add photos
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
