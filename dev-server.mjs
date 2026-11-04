// Server locale per provare il sito senza Netlify: `npm run dev` e apri http://localhost:8888
// Lo stato è salvato in .dev-state.json. Reset locale con chiave "dev".
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createApi } from './lib/server.mjs';
import league from './config/league.mjs';

const FILE = '.dev-state.json';
let etag = 0;
let mem = existsSync(FILE) ? JSON.parse(await readFile(FILE, 'utf8')) : null;
const store = {
  async read() { return mem ? { data: structuredClone(mem), etag: String(etag) } : null; },
  async write(data, tag) {
    if ((tag === null && mem) || (tag !== null && tag !== String(etag))) return false;
    mem = structuredClone(data); etag++;
    await writeFile(FILE, JSON.stringify(mem, null, 2));
    return true;
  },
};
// FAST=1 npm run dev  → tempi ridotti per fare prove veloci
const config = process.env.FAST
  ? { ...league, timers: Object.fromEntries(Object.entries(league.timers).map(([k]) => [k, 8])) }
  : league;
const api = createApi({ store, config, resetKey: 'dev' });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const r = await api.handle(new Request(url, {
      method: req.method, headers: req.headers,
      body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
    }));
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(await r.text());
    return;
  }
  const p = normalize(join('public', url.pathname === '/' ? 'index.html' : url.pathname));
  if (!p.startsWith('public')) { res.writeHead(403); res.end(); return; }
  try {
    const data = await readFile(p);
    res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(process.env.PORT || 8888, () => console.log(`FantaBuste su http://localhost:${process.env.PORT || 8888}`));
