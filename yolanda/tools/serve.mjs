// Minimal static file server for local testing (no dependencies).
// node tools/serve.mjs [port] - serves the yolanda/ folder; open /dist/... or /zombie/...
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || 5173);
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
};

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // test-evidence capture: POST /__shot/<name>.png (localhost only) -> zombie/shots/<name>.png
  if (req.method === 'POST' && p.startsWith('/__shot/')) {
    const ra = req.socket.remoteAddress || '';
    const name = p.slice(8).replace(/[^a-z0-9._-]/gi, '_');
    if (!/^(::1|127\.|::ffff:127\.)/.test(ra) || !/\.(png|json|txt)$/.test(name)) { res.writeHead(403); return res.end(); }
    const dir = path.join(root, 'zombie', 'shots');
    fs.mkdirSync(dir, { recursive: true });
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => { fs.writeFileSync(path.join(dir, name), Buffer.concat(chunks)); res.writeHead(200); res.end('ok'); });
    return;
  }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
}).listen(port, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log(`serving ${root} on http://localhost:${port}  LAN: ${lan.map(a => `http://${a}:${port}`).join(' ')}`);
});
