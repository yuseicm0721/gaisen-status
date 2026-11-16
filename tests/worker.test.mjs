import test from 'node:test';
import assert from 'node:assert/strict';
import worker, {resourceFor, needsLiveCheck, checkConnection, applyLiveCheck} from '../src/worker.js';
test('status root and required resources route independently', () => {
  assert.equal(resourceFor('/status').path, 'index.html');
  assert.equal(resourceFor('/status/').path, 'index.html');
  assert.equal(resourceFor('/status/data.json').data, true);
  assert.equal(resourceFor('/status/assets/fonts/line-seed-jp/abcd1234.woff2').type, 'font/woff2');
});

test('only stale or invalid recorded checks require an independent connection check', () => {
  const now = Date.now(), data = {service:{checkedAt:new Date(now).toISOString()}};
  assert.equal(needsLiveCheck(data,now),false);
  assert.equal(needsLiveCheck(data,now + 11 * 60000),true);
  assert.equal(needsLiveCheck({service:{checkedAt:'invalid'}},now),true);
  assert.equal(needsLiveCheck(data,now - 6 * 60000),true);
});

test('live connection uses the fixed root and requires both HTTP 200 and the site marker', async () => {
  const original = globalThis.fetch;
  try {
    for (const [http,body,expected] of [[200,'<html>ガイセンNOW</html>','up'],[200,'wrong page','down'],[530,'error','down']]) {
      globalThis.fetch = async (url,options) => {
        assert.equal(url,'https://gaisen.1mr.jp/');
        assert.equal(options.redirect,'manual');
        return new Response(body,{status:http});
      };
      const result = await checkConnection();
      assert.equal(result.status,expected);
      assert.equal(result.code,http);
      assert.ok(Number.isFinite(Date.parse(result.checkedAt)));
    }
  } finally {globalThis.fetch = original;}
});

test('network failure cannot become a successful live verification', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {throw new Error('network timeout');};
  try {
    const result = await checkConnection();
    assert.equal(result.status,'down');
    assert.equal(result.code,0);
  } finally {globalThis.fetch = original;}
});

test('a live verification preserves statistics, notices and original aggregation time', () => {
  const service={name:'ガイセンNOW',checkedAt:'2026-11-16T00:00:00Z',status:'up',code:200,periods:[{uptime:99}],days:[{date:'2026-11-16',failed:1}]};
  const data={version:1,generatedAt:'2026-11-16T00:00:01Z',service,services:[service],incidents:[{code:530}]};
  const before=structuredClone(data);
  const live={checkedAt:'2026-11-16T00:40:00Z',status:'down',code:503,responseTime:200};
  const result=applyLiveCheck(data,live);
  assert.equal(result.service.status,'down');
  assert.equal(result.service.code,503);
  assert.equal(result.service.checkedAt,live.checkedAt);
  assert.equal(result.generatedAt,data.generatedAt);
  assert.deepEqual(result.service.periods,data.service.periods);
  assert.deepEqual(result.service.days,data.service.days);
  assert.deepEqual(result.incidents,data.incidents);
  assert.equal(result.liveVerification.historyUpdatedAt,data.generatedAt);
  assert.deepEqual(data,before);
});

test('stale GitHub data reuses a real live check for at most one minute', async () => {
  const original = globalThis.fetch, stored = new Map(), pending = [];
  let rootChecks=0;
  const service={name:'ガイセンNOW',checkedAt:new Date(Date.now()-3600000).toISOString(),status:'up',code:200,periods:[],days:[]};
  const data={version:1,generatedAt:service.checkedAt,service,services:[service],incidents:[]};
  globalThis.caches={default:{match:async key=>stored.get(key.url)?.clone(),put:async (key,value)=>{stored.set(key.url,value.clone());}}};
  globalThis.fetch=async url=>{
    if(url==='https://gaisen.1mr.jp/') {rootChecks++;return new Response('ガイセンNOW');}
    assert.equal(url,'https://raw.githubusercontent.com/yuseicm0721/gaisen-status/main/status-data.json');
    return Response.json(data);
  };
  try {
    const context={waitUntil:promise=>pending.push(promise)};
    const first=await (await worker.fetch(new Request('https://gaisen.1mr.jp/status/data.json'),{},context)).json();
    await Promise.all(pending);
    const second=await (await worker.fetch(new Request('https://gaisen.1mr.jp/status/data.json'),{},context)).json();
    assert.equal(rootChecks,1);
    assert.equal(first.service.checkedAt,second.service.checkedAt);
    assert.equal(first.generatedAt,data.generatedAt);
    assert.equal(first.service.status,'up');
    assert.ok(first.liveVerification);
  } finally {globalThis.fetch=original;}
});
test('unrelated and arbitrary upstream paths are rejected', () => {
  for (const path of ['/', '/news', '/status-other', '/status/../config.php', '/status/config.php', '/status/https://example.com']) assert.equal(resourceFor(path), null);
});
test('worker serves without contacting the website origin', async () => {
  let target;
  const original = globalThis.fetch;
  globalThis.caches = {default: {match: async () => undefined, put: async () => {}}};
  globalThis.fetch = async (url, options) => {
    target = url;
    assert.equal(options.redirect, 'manual');
    return new Response('<html>status</html>');
  };
  try {
    const response = await worker.fetch(new Request('https://gaisen.1mr.jp/status'), {}, {waitUntil: () => {}});
    assert.equal(response.status, 200);
    assert.equal(target, 'https://yuseicm0721.github.io/gaisen-status/index.html');
    assert.equal(response.headers.get('X-Gaisen-Status-Origin'), 'cloudflare-worker');
  } finally {globalThis.fetch = original;}
});
test('unavailable monitoring data returns 503 instead of healthy status', async () => {
  const original = globalThis.fetch;
  globalThis.caches = {default: {match: async () => undefined}};
  globalThis.fetch = async () => new Response('bad', {status: 500});
  try {
    const response = await worker.fetch(new Request('https://gaisen.1mr.jp/status/data.json'), {}, {waitUntil: () => {}});
    assert.equal(response.status, 503);
  } finally {globalThis.fetch = original;}
});
