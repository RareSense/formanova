// Dropped files: which are CAD files the page opens, which are files a model
// refers to (textures, .bin, .mtl), and a lookup of them by name and path.

export const CAD_EXTS = ['3dm', 'glb', 'gltf', 'obj', 'stl', 'ply', 'step', 'stp'];
const SUPPORT_EXTS = ['bin', 'mtl', 'png', 'jpg', 'jpeg', 'webp', 'ktx2', 'tga', 'bmp'];

export interface FileEntry {
  file: File;
  /** Folder-relative path when known (folder drops), else the file name. */
  path: string;
}

export const ext = (name: string) => (name.match(/\.([^./\\]+)$/)?.[1] || '').toLowerCase();
export const isCadFile = (name: string) => CAD_EXTS.includes(ext(name));

// .3dm first, then formats that keep materials, then mesh-only formats.
const RANK = ['3dm', 'glb', 'gltf', 'obj', 'step', 'stp', 'ply', 'stl'];

/**
 * One piece per CAD file. Support files (textures, .bin, .mtl) go with every
 * piece from the same folder, so a dropped folder of GLTF/OBJ packages works.
 */
export function piecesFromEntries(entries: FileEntry[]): { cad: FileEntry; files: Map<string, File> }[] {
  const folder = (p: string) => p.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
  const support = entries.filter((e) => SUPPORT_EXTS.includes(ext(e.file.name)));
  return entries
    .filter((e) => isCadFile(e.file.name))
    .sort((a, b) => a.path.localeCompare(b.path) || RANK.indexOf(ext(a.file.name)) - RANK.indexOf(ext(b.file.name)))
    .map((cad) => {
      const files = new Map<string, File>();
      for (const s of support.filter((x) => folder(x.path) === folder(cad.path))) {
        files.set(s.file.name.toLowerCase(), s.file);
        files.set(s.path.toLowerCase().replace(/\\/g, '/'), s.file);
      }
      return { cad, files };
    });
}

/** Drag-and-drop with folders: walk directory entries. */
export async function entriesFromDrop(dataTransfer: DataTransfer): Promise<FileEntry[]> {
  const roots = [...(dataTransfer.items || [])].map((i) => i.webkitGetAsEntry?.()).filter(Boolean) as FileSystemEntry[];
  if (!roots.length) return [...dataTransfer.files].map((file) => ({ file, path: file.name }));
  const out: FileEntry[] = [];
  async function walk(entry: FileSystemEntry, prefix: string) {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      out.push({ file, path: prefix + file.name });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      let batch: FileSystemEntry[];
      do {
        batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
      } while (batch.length);
    }
  }
  for (const r of roots) await walk(r, '');
  return out;
}

export function entriesFromInput(fileList: FileList | File[]): FileEntry[] {
  return [...fileList].map((file) => ({ file, path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name }));
}
