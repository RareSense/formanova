/**
 * Serves dist/ the way the production nginx does, for the production-build
 * browser test: content types from nginx's stock mime.types, where `.mjs` is
 * missing and so goes out as application/octet-stream (seen on staging,
 * 2026-11-02), and the SPA fallback to index.html for any other path.
 * Usage: node e2e/prod/serve-dist.mjs <port>
 */
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const port = Number(process.argv[2] ?? 5180);

// nginx 1.18-1.24 conf/mime.types, the entries the app uses. No .mjs.
const TYPES = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.gif': 'image/gif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'text/xml', '.mp4': 'video/mp4',
};

function fileFor(urlPath) {
  const file = path.join(root, decodeURIComponent(urlPath));
  if (!file.startsWith(root)) return null;
  try { return statSync(file).isFile() ? file : null; } catch { return null; }
}

createServer((req, res) => {
  const urlPath = new URL(req.url ?? '/', 'http://x').pathname;
  const file = fileFor(urlPath) ?? path.join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1');
