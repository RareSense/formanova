/** "Rhino 0.6.2" for a Rhino run; null for untagged runs (website, Rhino 0.5.x and older). */
export function clientLabel(client: string | null | undefined, version: string | null | undefined): string | null {
  if (client !== 'rhino') return null;
  return version ? `Rhino ${version}` : 'Rhino';
}
