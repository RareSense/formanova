/**
 * cad-to-catalog-zip.ts
 *
 * "Download all": one zip, a folder per piece, every finished picture under
 * the tool's names (01_Front_White_Gold_White.png). JSZip is loaded only when
 * someone downloads.
 */
import type { Piece, Picture } from '@/lib/cad-to-catalog-queue';

const folderName = (piece: string) => (piece.replace(/\.[^.]+$/, '') || 'piece').replace(/[\\/:*?"<>|]+/g, '_').trim();
const extFor = (type: string) => (type.includes('jpeg') ? 'jpg' : type.includes('webp') ? 'webp' : 'png');

/** fetchBlob(picture) gives the picture's bytes (object URL or artifact proxy). */
export async function buildZip(pieces: Piece[], pictures: Picture[], fetchBlob: (p: Picture) => Promise<Blob>): Promise<{ zip: Blob; count: number }> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const names = new Map<string, number>();
  let count = 0;
  for (const piece of pieces) {
    const done = pictures.filter((x) => x.pieceId === piece.id && x.status === 'done');
    if (!done.length) continue;
    let folder = folderName(piece.name);
    const n = names.get(folder) || 0;
    names.set(folder, n + 1);
    if (n) folder = `${folder} (${n + 1})`; // two files with the same name
    for (const pic of done) {
      const blob = await fetchBlob(pic);
      zip.file(`${folder}/${pic.name}.${extFor(blob.type)}`, blob);
      count++;
    }
  }
  return { zip: await zip.generateAsync({ type: 'blob' }), count };
}
