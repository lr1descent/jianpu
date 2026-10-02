const path = require('node:path');
const { readFile, realpath } = require('node:fs/promises');

const APP_URL = 'jianpu://trainer/';
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'";
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.mp3': 'audio/mpeg', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

async function resourceResponse(root, request) {
  const headers = { 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' };
  const error = status => new Response(request.method === 'HEAD' ? null : `HTTP ${status}`, { status, headers });
  if (!['GET', 'HEAD'].includes(request.method)) return error(405);
  let url, pathname;
  try { url = new URL(request.url); pathname = decodeURIComponent(url.pathname); }
  catch { return error(400); }
  if (url.protocol !== 'jianpu:' || url.host !== 'trainer' || url.username || url.password) return error(403);
  if (/[\\\0:]/.test(pathname) || pathname.split('/').includes('..')) return error(403);
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  const contentType = TYPES[path.extname(relative).toLowerCase()];
  if (!contentType) return error(404);
  try {
    const directory = await realpath(root);
    const file = await realpath(path.join(directory, relative));
    if (!file.startsWith(directory + path.sep)) return error(403);
    const body = await readFile(file);
    return new Response(request.method === 'HEAD' ? null : body, {
      headers: { ...headers, 'Content-Type': contentType, 'Content-Length': String(body.length) },
    });
  } catch (errorValue) {
    if (['ENOENT', 'ENOTDIR', 'EISDIR'].includes(errorValue.code)) return error(404);
    throw errorValue;
  }
}

module.exports = { APP_URL, resourceResponse };
