import { authenticatedFetch } from "@/lib/authenticated-fetch";

/** A local object URL for a picture; artifact URLs need the auth header, others are public or local. */
export async function toObjectUrl(url: string): Promise<string> {
  const res = url.includes("/artifacts/") ? await authenticatedFetch(url) : await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  return URL.createObjectURL(await res.blob());
}

/** A File from a local (blob:/data:) or public picture URL. */
export async function fileFromUrl(url: string, name: string): Promise<File> {
  const blob = await (await fetch(url)).blob();
  return new File([blob], name, { type: blob.type || "image/png" });
}
