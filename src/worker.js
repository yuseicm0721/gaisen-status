const STATIC_ORIGIN = 'https://yuseicm0721.github.io/gaisen-status/';
const DATA_ORIGIN = 'https://raw.githubusercontent.com/yuseicm0721/gaisen-status/main/status-data.json';
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
export function resourceFor(pathname) {
  if (pathname === '/status' || pathname === '/status/') return {path: 'index.html', type: 'text/html; charset=utf-8', ttl: 300};
  if (pathname === '/status/data.json') return {data: true, type: 'application/json; charset=utf-8', ttl: 60};
  const path = pathname.slice('/status/'.length);
  if (!pathname.startsWith('/status/')) return null;
  if (/^(base|status)\.css$/.test(path)) return {path, type: 'text/css; charset=utf-8', ttl: 3600};
  if (/^(menu|status)\.js$/.test(path)) return {path, type: 'text/javascript; charset=utf-8', ttl: 3600};
  if (path === 'assets/brand-logo.svg') return {path, type: 'image/svg+xml', ttl: 86400};
  if (path === 'assets/fonts/line-seed-jp.css') return {path, type: 'text/css; charset=utf-8', ttl: 86400};
  if (/^assets\/fonts\/line-seed-jp\/[a-f0-9]+\.woff2$/.test(path)) return {path, type: 'font/woff2', ttl: 604800};
  return null;
}
function outgoing(response, type, stale = false) {
  const headers = new Headers(response.headers);
  headers.set('Content-Type', type);
  headers.set('Cache-Control', 'no-store');
  headers.set('Content-Security-Policy', CSP);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('X-Gaisen-Status-Origin', 'cloudflare-worker');
  if (stale) headers.set('X-Status-Stale', '1');
  headers.delete('Set-Cookie');
  return new Response(response.body, {status: response.status, headers});
}
export default {
  async fetch(request, env, ctx) {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status: 405, headers: {Allow: 'GET, HEAD'}});
    const url = new URL(request.url), resource = resourceFor(url.pathname);
    if (!resource) return new Response('Not found', {status: 404});
    const target = resource.data ? DATA_ORIGIN : STATIC_ORIGIN + resource.path;
    const cacheKey = new Request('https://gaisen.1mr.jp/status/__cache/20261115-4/' + (resource.data ? 'data.json' : resource.path));
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    const age = cached ? Date.now() - Number(cached.headers.get('X-Status-Cached-At')) : Infinity;
    let response;
    if (cached && age < resource.ttl * 1000) response = outgoing(cached, resource.type);
    else {
      try {
        const upstream = await fetch(target, {headers: {'User-Agent': 'GaisenNOW-Status/1.0'}, redirect: 'manual', signal: AbortSignal.timeout(10000), cf: {cacheTtl: 0}});
        if (!upstream.ok) throw new Error('Upstream unavailable');
        const body = await upstream.arrayBuffer();
        if (resource.data) {
          const data = JSON.parse(new TextDecoder().decode(body));
          if (data.version !== 1 || !Array.isArray(data.services) || !data.services.length) throw new Error('Invalid monitoring data');
        }
        const stored = new Response(body, {headers: {'Content-Type': resource.type, 'Cache-Control': 'public, max-age=604800', 'X-Status-Cached-At': String(Date.now())}});
        ctx.waitUntil(cache.put(cacheKey, stored.clone()).catch(() => {}));
        response = outgoing(stored, resource.type);
      } catch {
        response = cached ? outgoing(cached, resource.type, true) : new Response(resource.data ? '{"error":"Monitoring data is temporarily unavailable"}' : '稼働状況ページを読み込めませんでした。時間をおいてご確認ください。', {status: 503, headers: {'Content-Type': resource.data ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Gaisen-Status-Origin': 'cloudflare-worker'}});
      }
    }
    if (request.method === 'HEAD') return new Response(null, {status: response.status, headers: response.headers});
    return response;
  },
};
