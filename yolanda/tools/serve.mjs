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
  // the Sound Board's save (zombie/sounds.html): POST /__sfx/selection.json -> zombie/assets/sfx/selection.json only,
  // from this machine or a phone on the home network (judging sounds on the phone's own speaker)
  if (req.method === 'POST' && p === '/__sfx/selection.json') {
    const ra = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    if (!/^(::1$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ra)) { res.writeHead(403); return res.end(); }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      try { JSON.parse(body); } catch { res.writeHead(400); return res.end('bad json'); }
      fs.writeFileSync(path.join(root, 'zombie', 'assets', 'sfx', 'selection.json'), body); res.writeHead(200); res.end('ok');
    });
    return;
  }
  // the Reveal Studio's save (zombie/combat.html?intro=1&studio=1): POST /__reveal/tuning.json ->
  // zombie/assets/opening/reveal_tuning.json only, from this machine or the home network
  if (req.method === 'POST' && p === '/__reveal/tuning.json') {
    const ra = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    if (!/^(::1$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ra)) { res.writeHead(403); return res.end(); }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      try { JSON.parse(body); } catch { res.writeHead(400); return res.end('bad json'); }
      fs.writeFileSync(path.join(root, 'zombie', 'assets', 'opening', 'reveal_tuning.json'), body); res.writeHead(200); res.end('ok');
    });
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
