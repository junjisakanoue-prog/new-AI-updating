// 静的ファイル配信 + 記事 API の軽量サーバー。依存なし。

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const PORT = Number(process.env.PORT ?? 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-cache' });
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), MIME['.json']);
}

/** ディレクトリ外への脱出を防ぐ */
function safeJoin(base, target) {
  const p = path.resolve(base, '.' + path.posix.normalize('/' + target));
  return p.startsWith(base) ? p : null;
}

async function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const file = safeJoin(PUBLIC, rel);
  if (!file) return send(res, 403, 'Forbidden');
  try {
    const body = await readFile(file);
    send(res, 200, body, MIME[path.extname(file)] ?? 'application/octet-stream');
  } catch {
    send(res, 404, 'Not found');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = decodeURIComponent(url.pathname);

  // GitHub Pages と同じ構成にするため、data/ もそのまま静的配信する。
  // フロントエンドは data/index.json と data/articles/*.json を直接読む。
  if (p.startsWith('/data/')) {
    const file = safeJoin(DATA, p.slice('/data'.length));
    if (!file) return send(res, 403, 'Forbidden');
    try {
      const body = await readFile(file);
      return send(res, 200, body, MIME[path.extname(file)] ?? 'application/octet-stream');
    } catch {
      return sendJson(res, 404, { error: 'not found' });
    }
  }

  return serveStatic(res, p);
});

// 0.0.0.0 で待ち受けることで、同じ Wi-Fi 内のスマホからも確認できる
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  AI Daily Brief → http://localhost:${PORT}`);
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) {
        console.log(`  同一 Wi-Fi 内から  → http://${a.address}:${PORT}  (${name})`);
      }
    }
  }
  console.log('');
});
