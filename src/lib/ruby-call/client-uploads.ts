/**
 * Files the caller shares during a Ruby call (request_upload). Images go to
 * FormaNova's existing /upload as jewelry or inspiration photos; CAD and other
 * files are shared as links instead.
 */
import { uploadToAzure } from '@/lib/microservices-api';
import type { UploadPurpose } from './panels';
import type { CallLink, CallUpload } from './sales-call-api';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif'];

export const PURPOSE_LABELS: Record<UploadPurpose, string> = {
  jewelry_photos: 'jewellery photos',
  references: 'references',
  cad_files: 'CAD files',
  other: 'other files',
};

/** Only photos and references are uploaded as files; the rest come as links. */
export const acceptsFiles = (purpose: UploadPurpose) => purpose === 'jewelry_photos' || purpose === 'references';

export function uploadProblem(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return 'Only images (JPG, PNG, WebP, HEIC) can be uploaded here.';
  if (file.size > MAX_UPLOAD_BYTES) return 'This image is over 20 MB.';
  return null;
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'));
    reader.readAsDataURL(file);
  });
}

export async function uploadClientFile(file: File, purpose: UploadPurpose): Promise<CallUpload> {
  const problem = uploadProblem(file);
  if (problem) throw new Error(problem);
  const assetType = purpose === 'jewelry_photos' ? 'jewelry_photo' : 'inspiration_photo';
  const res = await uploadToAzure(await toBase64(file), file.type, assetType);
  const sha = res.uri?.match(/[a-f0-9]{64}/i)?.[0];
  return { name: file.name, uri: res.uri, ...(sha ? { sha256: sha } : {}), purpose };
}

/** Accepts "store.com/x" as https; null when it is not a web link. */
export function normalizeLink(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const candidate = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export const linkRecord = (url: string, now = new Date()): CallLink => ({ url, at: now.toISOString() });

/** What Ruby is told after files arrive (contract §3). */
export function uploadedMessage(purpose: UploadPurpose, names: string[]): string {
  return `The client just uploaded ${names.length} file(s) for ${PURPOSE_LABELS[purpose]} (${names.join(', ')}). They are saved. Thank them briefly and continue.`;
}

export function linkMessage(url: string): string {
  return `The client shared a link: ${url}. It is saved. Thank them briefly and continue.`;
}
