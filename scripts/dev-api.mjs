// Local API server for testing: runs the Vercel-style handlers in /api on http://127.0.0.1:3100
// without the Vercel CLI, so nothing is pulled from the cloud. Start it with `npm run dev:api`
// (loads .env.local) next to `npm run dev` (Vite proxies /api here).
import http from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

if (String(process.env.MESSAGING_DRY_RUN || '').toLowerCase() !== 'true') {
  console.error('Refusing to start: set MESSAGING_DRY_RUN=true in .env.local (local testing never sends real messages).');
  process.exit(1);
}
delete process.env.VERCEL_ENV;

const apiRoot = path.resolve('api');
const port = Number(process.env.DEV_API_PORT || 3100);

const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const type = String(req.headers['content-type'] || '');
      if (!raw) return resolve(undefined);
      try {
        if (type.includes('application/json')) return resolve(JSON.parse(raw));
        if (type.includes('application/x-www-form-urlencoded')) return resolve(Object.fromEntries(new URLSearchParams(raw)));
      } catch {
        // fall through to raw text
      }
      resolve(raw);
    });
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const relative = url.pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
  const file = path.resolve(apiRoot, `${relative}.js`);
  const inApi = file.startsWith(apiRoot + path.sep) && !file.includes(`${path.sep}_lib${path.sep}`);

  const sendJson = (status, payload) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  };

  if (!url.pathname.startsWith('/api/') || !inApi || !existsSync(file)) {
    return sendJson(404, { error: 'Not found' });
  }

  req.query = Object.fromEntries(url.searchParams);
  req.body = await readBody(req);

  // Minimal Vercel-style response helpers.
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  };
  res.send = (payload) => {
    res.end(typeof payload === 'string' || Buffer.isBuffer(payload) ? payload : JSON.stringify(payload));
  };

  try {
    const { default: handler } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    await handler(req, res);
  } catch (error) {
    console.error(`[dev-api] ${req.method} ${url.pathname} failed:`, error?.message || error);
    if (!res.headersSent) sendJson(500, { error: 'Server error' });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[dev-api] listening on http://127.0.0.1:${port} (dry run: no real messages are sent)`);
});
