import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('dist'),
  port = Number(process.env.PORT ?? 4173);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`),
      path = resolve(
        root,
        '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname),
      );
    if (!path.startsWith(root + sep)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    if (!(await stat(path)).isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': mime[extname(path)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy':
        "default-src 'self'; connect-src 'self' https://api.carbonintensity.org.uk https://api.open-meteo.com; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    });
    res.end(await readFile(path));
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT') {
      res.writeHead(404);
      res.end('Not found');
    } else {
      console.error('Local server error', e);
      res.writeHead(500);
      res.end('Local server error');
    }
  }
}).listen(port, '127.0.0.1', () =>
  console.log(`Grid Weather → http://127.0.0.1:${port} (local only)`),
);
