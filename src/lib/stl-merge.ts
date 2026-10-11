/**
 * Joins several STL files into one binary STL.
 *
 * Manufacturers and print services take one STL per piece. The backend writes one STL per part,
 * and the download used to start one browser download per part (15 files for a 15-part piece).
 * The parts are already placed in one coordinate frame, so their triangles go into a single file
 * unchanged.
 */

/** Blob bytes, via FileReader where Blob.arrayBuffer is missing (older browsers, jsdom). */
export function blobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the STL file.'));
    reader.readAsArrayBuffer(blob);
  });
}

function isBinaryStl(bytes: Uint8Array): boolean {
  if (bytes.length < 84) return false;
  const count = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true);
  return bytes.length === 84 + count * 50;
}

/** Each triangle as 12 floats: normal, then three vertices. */
function readTriangles(bytes: Uint8Array): Float32Array[] {
  const triangles: Float32Array[] = [];
  if (isBinaryStl(bytes)) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = view.getUint32(80, true);
    for (let t = 0; t < count; t += 1) {
      const record = new Float32Array(12);
      for (let k = 0; k < 12; k += 1) record[k] = view.getFloat32(84 + t * 50 + k * 4, true);
      triangles.push(record);
    }
    return triangles;
  }
  const text = new TextDecoder('ascii').decode(bytes);
  const facet = /facet\s+normal\s+(\S+)\s+(\S+)\s+(\S+)[\s\S]*?vertex\s+(\S+)\s+(\S+)\s+(\S+)[\s\S]*?vertex\s+(\S+)\s+(\S+)\s+(\S+)[\s\S]*?vertex\s+(\S+)\s+(\S+)\s+(\S+)[\s\S]*?endfacet/g;
  for (let match = facet.exec(text); match; match = facet.exec(text)) {
    triangles.push(Float32Array.from(match.slice(1, 13).map(Number)));
  }
  return triangles;
}

export async function mergeStlBlobs(blobs: Blob[], header = 'FormaNova model'): Promise<Blob> {
  const all: Float32Array[] = [];
  for (const blob of blobs) {
    all.push(...readTriangles(new Uint8Array(await blobBytes(blob))));
  }
  const out = new ArrayBuffer(84 + all.length * 50);
  const view = new DataView(out);
  const title = new TextEncoder().encode(header.slice(0, 79));
  new Uint8Array(out, 0, title.length).set(title);
  view.setUint32(80, all.length, true);
  all.forEach((record, t) => {
    for (let k = 0; k < 12; k += 1) view.setFloat32(84 + t * 50 + k * 4, record[k], true);
  });
  return new Blob([out], { type: 'model/stl' });
}
