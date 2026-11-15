import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize, jstDate} from '../scripts/status-model.mjs';
const start = Date.parse('2026-11-15T14:55:00Z');
test('first check does not invent uptime', () => {
  assert.equal(summarize([[start, 'up', 100]], start).periods[0].uptime, null);
});
test('long monitoring gaps are excluded', () => {
  const data = summarize([[start, 'up'], [start + 3600000, 'up']], start + 3600000);
  assert.equal(data.periods[0].observedSeconds, 0);
  assert.equal(data.periods[0].uptime, null);
});
test('uptime weights observed time and counts failures', () => {
  const data = summarize([[start, 'up'], [start + 300000, 'down'], [start + 600000, 'up']], start + 600000);
  assert.equal(data.periods[0].uptime, 50);
  assert.equal(data.periods[0].observedSeconds, 600);
  assert.equal(data.days.reduce((n, d) => n + d.failed, 0), 1);
});
test('observed intervals split across Japan midnight', () => {
  const data = summarize([[start, 'up'], [start + 600000, 'up']], start + 600000);
  assert.equal(jstDate(start), '2026-11-15');
  assert.deepEqual(data.days.map(d => [d.date, d.observedSeconds]), [['2026-11-15', 300], ['2026-11-16', 300]]);
});
