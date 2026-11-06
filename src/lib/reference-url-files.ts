import { authenticatedFetch } from "@/lib/authenticated-fetch";

/**
 * Saved reference photos are auth-gated links, so they are read through
 * authenticatedFetch and turned back into Files a run can upload. All or
 * nothing: a run sent with only some of its photos is worse than no run.
 */
export async function fetchReferenceFiles(urls: string[]): Promise<File[]> {
  return Promise.all(urls.map(async (url, index) => {
    const res = await authenticatedFetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    const blob = await res.blob();
    return new File([blob], `reused-reference-${index}.webp`, { type: blob.type || "image/webp" });
  }));
}
