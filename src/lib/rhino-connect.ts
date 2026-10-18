/**
 * FormaNova for Rhino signs in without copying a key: the plug-in listens on this computer
 * (127.0.0.1 only) and opens /connect-rhino?port=…&state=…. The page then sends the browser to
 * http://127.0.0.1:<port>/callback with the key and the same state, and Rhino signs itself in.
 *
 * Only a real loopback port and a 32-character hex state are accepted, so the page can never be
 * used to send the key anywhere but this computer.
 */
export function rhinoCallbackUrl(port: string | null, state: string | null, key: string | null): string | null {
  if (!port || !state || !key) return null;
  if (!/^\d{4,5}$/.test(port)) return null;
  const n = Number(port);
  if (n < 1024 || n > 65535) return null;
  if (!/^[0-9a-f]{32}$/.test(state)) return null;
  const params = new URLSearchParams({ state, key });
  return `http://127.0.0.1:${n}/callback?${params.toString()}`;
}
