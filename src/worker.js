import {recordResult, publicData} from './monitor-state.js';
const STATIC_ORIGIN = 'https://yuseicm0721.github.io/gaisen-status/';
const DATA_ORIGIN = 'https://raw.githubusercontent.com/yuseicm0721/gaisen-status/main/status-data.json';
const LIVE_AFTER = 10 * 60000;
const CACHE_BASE = 'https://gaisen.1mr.jp/status/__cache/20261116-4/';
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
export function resourceFor(pathname) {
  if (pathname === '/status' || pathname === '/status/') return {path: 'index.html', type: 'text/html; charset=utf-8', ttl: 300};
  if (pathname === '/status/data.json') return {data: true, type: 'application/json; charset=utf-8', ttl: 60};
  if (pathname === '/status/history.json') return {data: true, state: true, type: 'application/json; charset=utf-8', ttl: 60};
  const path = pathname.slice('/status/'.length);
  if (!pathname.startsWith('/status/')) return null;
  if (/^(base|status)\.css$/.test(path)) return {path, type: 'text/css; charset=utf-8', ttl: 3600};
  if (/^(menu|status|status-errors)\.js$/.test(path)) return {path, type: 'text/javascript; charset=utf-8', ttl: 3600};
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
export function needsLiveCheck(data, now = Date.now()) {
  const checked = Date.parse((data.service || data.services?.[0])?.checkedAt);
  return !Number.isFinite(checked) || now - checked > LIVE_AFTER || checked > now + 300000;
}
export async function checkConnection() {
  const start = Date.now();
  let status = 'down', code = 0;
  try {
    // Fixed target: status-page input must never select an arbitrary URL.
    const response = await fetch('https://gaisen.1mr.jp/', {headers: {'User-Agent': 'GaisenNOW-Status/1.0', 'Cache-Control': 'no-cache'}, redirect: 'manual', signal: AbortSignal.timeout(5000), cf: {cacheTtl: 0}});
    code = response.status;
    if (code === 200 && (await response.text()).includes('ガイセンNOW')) status = 'up';
  } catch { /* A failed connection keeps code 0; a body failure retains its HTTP code. */ }
  return {status, code, checkedAt: new Date().toISOString(), responseTime: Date.now() - start};
}
export function applyLiveCheck(data, live) {
  const service = {...(data.service || data.services[0]), ...live};
  // A real connection check updates only current health. Historical statistics,
  // notices and their original timestamps remain exactly as recorded in GitHub.
  return {...data, service, services: [service], liveVerification: {checkedAt: live.checkedAt, historyUpdatedAt: data.generatedAt}};
}
async function storedState(env) {
  return env.STATUS_STORE ? env.STATUS_STORE.get('state', {type:'json',cacheTtl:60}) : null;
}
export async function scheduledCheck(env) {
  if (!env.STATUS_STORE) throw new Error('Monitoring storage is not configured');
  let state=await storedState(env);
  if (!state) {
    for(const filename of ['cloudflare-state.json','cloudflare-seed.json']) {
      try {
        const response=await fetch('https://raw.githubusercontent.com/yuseicm0721/gaisen-status/main/history/'+filename, {redirect:'manual',signal:AbortSignal.timeout(5000),cf:{cacheTtl:0}});
        if(!response.ok)continue;
        const saved=await response.json();
        if(saved.schemaVersion===1 && Array.isArray(saved.intervals) && saved.latest) {state=saved;break;}
      } catch { /* Try the preserved initial seed if a newer archive is unavailable. */ }
    }
    if(!state)throw new Error('Historical monitoring state unavailable');
  }
  let result=await checkConnection();
  for(let attempt=1;result.status!=='up' && attempt<3;attempt++)result=await checkConnection();
  let next=recordResult(state,result);
  if(Date.now()-(state.maintenanceSyncedAt || 0)>3600000) {
    try {
      const response=await fetch('https://api.github.com/repos/yuseicm0721/gaisen-status/issues?state=all&labels=maintenance&per_page=100', {headers:{Accept:'application/vnd.github+json','User-Agent':'GaisenNOW-Status'},redirect:'manual',signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw new Error('Maintenance source unavailable');
      const maintenance=(await response.json()).filter(i=>!i.pull_request).map(i=>({id:i.number,source:'upptime',type:'maintenance',services:['ガイセンNOW'],title:i.title,state:i.state,startedAt:i.created_at,resolvedAt:i.closed_at,url:i.html_url}));
      next.incidents=[...next.incidents.filter(i=>i.type!=='maintenance'),...maintenance].sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt));
      next.maintenanceAvailable=true;
    } catch {next.maintenanceAvailable=false;}
    next.maintenanceSyncedAt=Date.now();
  }
  await env.STATUS_STORE.put('state',JSON.stringify(next));
  console.log('Saved scheduled health check',result.checkedAt,result.status,result.code);
  return next;
}
export default {
  async scheduled(controller,env,ctx) { await scheduledCheck(env); },
  async fetch(request, env, ctx) {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status: 405, headers: {Allow: 'GET, HEAD'}});
    const url = new URL(request.url), resource = resourceFor(url.pathname);
    if (!resource) return new Response('Not found', {status: 404});
    const target = resource.data ? DATA_ORIGIN : STATIC_ORIGIN + resource.path;
    const cacheKey = new Request(CACHE_BASE + (resource.state ? 'history.json' : resource.data ? 'data.json' : resource.path));
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    const age = cached ? Date.now() - Number(cached.headers.get('X-Status-Cached-At')) : Infinity;
    let response;
    if (cached && age < resource.ttl * 1000) response = outgoing(cached, resource.type);
    else {
      try {
        let body;
        if(resource.data && env.STATUS_STORE) {
          const state=await storedState(env);
          if(state)body=new TextEncoder().encode(JSON.stringify(resource.state ? state : publicData(state)));
        }
        if(!body) {
          if(resource.state)throw new Error('Monitoring history unavailable');
          const upstream = await fetch(target, {headers: {'User-Agent': 'GaisenNOW-Status/1.0'}, redirect: 'manual', signal: AbortSignal.timeout(resource.data ? 5000 : 10000), cf: {cacheTtl: 0}});
          if (!upstream.ok) throw new Error('Upstream unavailable');
          body = await upstream.arrayBuffer();
        }
        if (resource.data && !resource.state) {
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
    if (resource.data && !resource.state && response.ok) {
      const data = await response.json();
      if (needsLiveCheck(data)) {
        const liveKey = new Request(CACHE_BASE + 'live.json');
        const previous = await cache.match(liveKey);
        let live = previous ? await previous.json() : null;
        const age = live ? Date.now() - Date.parse(live.checkedAt) : Infinity;
        if (!live || !Number.isFinite(age) || age < 0 || age >= 60000) {
          live = await checkConnection();
          ctx.waitUntil(cache.put(liveKey, new Response(JSON.stringify(live), {headers: {'Cache-Control': 'public, max-age=120'}})).catch(() => {}));
        }
        response = outgoing(new Response(JSON.stringify(applyLiveCheck(data, live))), resource.type);
      } else response = outgoing(new Response(JSON.stringify(data)), resource.type, response.headers.has('X-Status-Stale'));
    }
    if (request.method === 'HEAD') return new Response(null, {status: response.status, headers: response.headers});
    return response;
  },
};
