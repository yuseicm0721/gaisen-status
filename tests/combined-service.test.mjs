import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeCombined, combinedStatus} from '../scripts/status-model.mjs';
const T = Date.parse('2026-11-15T00:00:00Z');
const sample = (minutes, status = 'up') => [T + minutes * 60000, status, 100];
test('a single failed page is partial failure; all failed pages are down', () => {
  assert.equal(combinedStatus(['up','up']), 'up');
  assert.equal(combinedStatus(['up','down']), 'degraded');
  assert.equal(combinedStatus(['down','down']), 'down');
  assert.equal(combinedStatus(['degraded','degraded']), 'degraded');
});
test('two monitors share one timeline rather than doubling elapsed time', () => {
  const checks = [sample(0),sample(5),sample(10)];
  const result = summarizeCombined([checks, checks], T + 600000);
  assert.equal(result.periods[0].observedSeconds, 600);
  assert.equal(result.periods[0].uptime, 100);
  assert.equal(result.days.length, 1);
});
test('news-only failure affects unified uptime and partial-failure history', () => {
  const website = [sample(0),sample(5),sample(10)];
  const news = [sample(0),sample(5,'down'),sample(10)];
  const result = summarizeCombined([website,news],T + 600000);
  assert.equal(result.periods[0].uptime, 50);
  assert.equal(result.days[0].partialSeconds, 300);
  assert.equal(result.days[0].observedSeconds - result.days[0].upSeconds, 300);
});
test('a full outage is distinguished from a partial outage', () => {
  const checks = [sample(0,'down'),sample(5),sample(10)];
  const result = summarizeCombined([checks,checks],T + 600000);
  assert.equal(result.periods[0].uptime, 50);
  assert.equal(result.days[0].partialSeconds || 0, 0);
  assert.ok(result.days[0].failed > 0);
});
test('alternating failures are not averaged into healthy time', () => {
  const website = [sample(0,'down'),sample(5),sample(10)];
  const news = [sample(0),sample(5,'down'),sample(10)];
  const result = summarizeCombined([website,news],T + 600000);
  assert.equal(result.periods[0].uptime, 0);
  assert.equal(result.days[0].partialSeconds, 600);
});
test('only intervals observed by both monitors are aggregated', () => {
  const website = [sample(0),sample(10)];
  const news = [[T + 1000,'up'],[T + 601000,'up']];
  const result = summarizeCombined([website,news],T + 601000);
  assert.equal(result.periods[0].observedSeconds, 599);
});
test('missing or disjoint monitoring coverage is not filled', () => {
  const result = summarizeCombined([[sample(0),sample(5)],[sample(10),sample(15)]],T + 900000);
  assert.equal(result.periods[0].uptime, null);
  assert.equal(result.periods[0].observedSeconds, 0);
  const gap = summarizeCombined([[sample(0),sample(5)],[sample(0),sample(60)]],T + 3600000);
  assert.equal(gap.periods[0].observedSeconds, 0);
});
test('imported history is preserved with no double counting at cutover', () => {
  const archive = {coverage:{start:new Date(T).toISOString(),end:new Date(T + 300000).toISOString()},incidents:[]};
  const checks = [sample(0),sample(10)];
  const result = summarizeCombined([checks,checks],T + 600000,archive);
  assert.equal(result.periods[0].observedSeconds, 600);
  assert.equal(result.periods[0].uptime, 100);
  assert.deepEqual(result.days[0].sources.sort(),['upptime','uptimerobot']);
});
