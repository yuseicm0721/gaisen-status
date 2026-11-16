import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, access, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {migrateLedger, migrateHistory} from '../scripts/migrate-single-monitor.mjs';
import {monitor, summarize} from '../scripts/status-model.mjs';

test('single monitor keeps original samples, downtime and start dates without double counting', () => {
  const samples = [[1000000,'down',80],[1300000,'up',100],[1600000,'up',90]];
  const legacy = {website:samples,news:[[1000010,'up',200],[1300010,'up',150]]};
  const migrated = migrateLedger(legacy);
  assert.deepEqual(Object.keys(migrated),['gaisen-now']);
  assert.deepEqual(migrated['gaisen-now'],samples);
  assert.equal(summarize(migrated['gaisen-now'],1600000).periods[0].uptime,50);
  assert.equal(summarize(migrated['gaisen-now'],1600000).periods[0].observedSeconds,600);
  assert.deepEqual(migrateLedger(migrated),migrated);
  assert.ok(legacy.news);
  assert.equal(monitor.url,'https://gaisen.1mr.jp/');
});
test('migration preserves source files byte for byte and is safe to rerun', async () => {
  const dir = await mkdtemp(join(tmpdir(),'gaisen-migration-'));
  try {
    const raw = '{"website":[[1000000,"up",80]],"news":[[1000010,"up",90]]}\n';
    await writeFile(join(dir,'checks.json'),raw);
    await writeFile(join(dir,'website.yml'),'startTime: original-start\n');
    await writeFile(join(dir,'news.yml'),'startTime: other-start\n');
    await writeFile(join(dir,'summary.json'),'[]\n');
    assert.equal(await migrateHistory(dir),true);
    assert.equal(await readFile(join(dir,'gaisen-now.yml'),'utf8'),'startTime: original-start\n');
    assert.equal(await readFile(join(dir,'retired/20261116-single-monitor/checks.json'),'utf8'),raw);
    assert.equal(await readFile(join(dir,'retired/20261116-single-monitor/news.yml'),'utf8'),'startTime: other-start\n');
    await assert.rejects(access(join(dir,'news.yml')));
    await assert.rejects(access(join(dir,'website.yml')));
    await assert.rejects(access(join(dir,'summary.json')));
    assert.equal(await migrateHistory(dir),false);
    assert.equal(await readFile(join(dir,'retired/20261116-single-monitor/checks.json'),'utf8'),raw);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('missing or mixed source data fails rather than overwriting history', () => {
  assert.throws(()=>migrateLedger({news:[]}),/Missing/);
  assert.throws(()=>migrateLedger({'gaisen-now':[],website:[]}),/Mixed/);
});
