import test from 'node:test';
import assert from 'node:assert/strict';
import worker, {resourceFor} from '../src/worker.js';
test('status root and required resources route independently', () => {
  assert.equal(resourceFor('/status').path, 'index.html');
  assert.equal(resourceFor('/status/').path, 'index.html');
  assert.equal(resourceFor('/status/data.json').data, true);
  assert.equal(resourceFor('/status/assets/fonts/line-seed-jp/abcd1234.woff2').type, 'font/woff2');
});
test('unrelated and arbitrary upstream paths are rejected', () => {
  for (const path of ['/', '/news', '/status-other', '/status/../config.php', '/status/config.php', '/status/https://example.com']) assert.equal(resourceFor(path), null);
});
test('worker serves without contacting the website origin', async () => {
  let target;
  const original = globalThis.fetch;
  globalThis.caches = {default: {match: async () => undefined, put: async () => {}}};
  globalThis.fetch = async url => {target = url; return new Response('<html>status</html>');};
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
