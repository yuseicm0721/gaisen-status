import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {importSnapshot} from '../scripts/import-uptimerobot.mjs';
import {summarize} from '../scripts/status-model.mjs';
const sourceBytes = readFileSync(new URL('../history/imported/uptimerobot-800442063-source.json', import.meta.url));
const source = JSON.parse(sourceBytes);
const archive = JSON.parse(readFileSync(new URL('../history/imported/uptimerobot-800442063.json', import.meta.url)));
const time = value => Date.parse(value);
function fixture(start, end, incidents = []) {
  return {coverage:{start,end},incidents};
}
test('all 90 original UTC ratios match exact outage intervals', () => {
  const imported = importSnapshot(source, {cutover: archive.coverage.end, fetchedAt: archive.fetchedAt});
  assert.equal(imported.validation.dailyRatiosCompared, 90);
  assert.equal(imported.validation.matched, true);
  assert.equal(imported.incidents.length, 26);
  assert.deepEqual(imported.coverage, archive.coverage);
});
test('stored source snapshot retains its verification hash', () => {
  assert.equal(createHash('sha256').update(sourceBytes).digest('hex'), archive.sourceSha256);
});
test('import refuses a different monitor or mismatched daily data', () => {
  const wrongMonitor = structuredClone(source); wrongMonitor.monitor.monitorId = 1;
  assert.throws(() => importSnapshot(wrongMonitor, {cutover:archive.coverage.end, fetchedAt:archive.fetchedAt}), /Unexpected source/);
  const wrongRatio = structuredClone(source); wrongRatio.monitor.dailyRatios[0].ratio = '100.000';
  assert.throws(() => importSnapshot(wrongRatio, {cutover:archive.coverage.end, fetchedAt:archive.fetchedAt}), /disagrees/);
});
test('historical UTC November 8 downtime belongs to November 9 in Japan', () => {
  const data = summarize([], time(archive.coverage.end), archive);
  const nov9 = data.days.find(d => d.date === '2026-11-09');
  assert.equal(nov9.observedSeconds - nov9.upSeconds, 306);
  assert.deepEqual(nov9.sources, ['uptimerobot']);
  assert.equal(nov9.checks, null);
});
test('long historical outage is split accurately at Japan midnight', () => {
  const data = summarize([], time(archive.coverage.end), archive);
  const oct21 = data.days.find(d => d.date === '2026-10-21');
  const oct22 = data.days.find(d => d.date === '2026-10-22');
  const long = archive.incidents.find(i => i.durationSeconds > 3600);
  const oct22Other = archive.incidents.filter(i => i !== long && i.startedAt.startsWith('2026-10-22')).reduce((n, i) => n + i.durationSeconds, 0);
  assert.equal(oct21.observedSeconds - oct21.upSeconds, 2535);
  assert.equal((oct21.observedSeconds - oct21.upSeconds) + (oct22.observedSeconds - oct22.upSeconds), long.durationSeconds + oct22Other);
});
test('archive cutover and overlapping new samples never count time twice', () => {
  const start = '2026-11-15T00:00:00Z', end = '2026-11-15T00:10:00Z';
  const data = summarize([[time('2026-11-15T00:05:00Z'),'up'],[time('2026-11-15T00:15:00Z'),'up']], time('2026-11-15T00:15:00Z'), fixture(start,end));
  assert.equal(data.periods[0].observedSeconds, 900);
  assert.equal(data.periods[0].uptime, 100);
  assert.deepEqual(data.days[0].sources.sort(), ['upptime','uptimerobot']);
});
test('only actual archive coverage is filled; missing days remain absent', () => {
  const old = fixture('2026-11-12T12:00:00Z', '2026-11-12T13:00:00Z');
  const data = summarize([[time('2026-11-15T00:00:00Z'),'up'],[time('2026-11-15T00:05:00Z'),'up']],time('2026-11-15T00:05:00Z'),old);
  assert.equal(data.periods[0].observedSeconds, 300);
  assert.equal(data.periods[1].observedSeconds, 3900);
  assert.equal(data.days.some(d => d.date === '2026-11-13'), false);
  assert.equal(data.days.some(d => d.date === '2026-11-14'), false);
});
test('new monitors do not inherit another monitor history', () => {
  const now = time(archive.coverage.end);
  const data = summarize([[now,'up']], now);
  assert.equal(data.days.length, 1);
  assert.equal(data.periods[0].uptime, null);
  assert.deepEqual(data.days[0].sources, ['upptime']);
});
test('imported downtime is time weighted in current rolling metrics', () => {
  const data = summarize([], time(archive.coverage.end), archive);
  assert.equal(data.periods.find(p => p.days === 7).uptime, 99.949);
  assert.equal(data.periods.find(p => p.days === 30).uptime, 98.468);
});
