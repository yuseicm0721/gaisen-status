export const monitor = {slug: 'gaisen-now', name: 'ガイセンNOW', description: '街宣情報・ニュースを提供するガイセンNOW', url: 'https://gaisen.1mr.jp/'};
const DAY = 86400000;
const MAX_GAP = 15 * 60000;
export const jstDate = time => new Date(time + 9 * 3600000).toISOString().slice(0, 10);

export function archiveIntervals(archive) {
  if (!archive) return [];
  const start = Date.parse(archive.coverage.start), end = Date.parse(archive.coverage.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('Invalid archive coverage');
  const intervals = [];
  let cursor = start;
  for (const outage of archive.incidents) {
    const a = Math.max(start, Date.parse(outage.startedAt));
    const b = Math.min(end, Date.parse(outage.resolvedAt));
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('Invalid archive incident');
    if (b <= a) continue;
    if (a < cursor) throw new Error('Overlapping archive incidents');
    if (a > cursor) intervals.push([cursor, a, 'up', 'uptimerobot']);
    intervals.push([a, b, 'down', 'uptimerobot']);
    cursor = b;
  }
  if (cursor < end) intervals.push([cursor, end, 'up', 'uptimerobot']);
  return intervals;
}

export function summarize(samples, now, archive = null) {
  const sorted = [...samples].sort((a, b) => a[0] - b[0]);
  const days = new Map();
  const intervals = archiveIntervals(archive);
  const cutover = archive ? Date.parse(archive.coverage.end) : -Infinity;
  for (const sample of sorted) {
    if (sample[0] < cutover || sample[0] > now) continue;
    const date = jstDate(sample[0]);
    const day = days.get(date) || {date, checks: 0, failed: 0, upSeconds: 0, observedSeconds: 0, sources: []};
    day.checks++;
    if (sample[1] !== 'up') day.failed++;
    if (!day.sources.includes('upptime')) day.sources.push('upptime');
    days.set(date, day);
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const [rawStart, status] = sorted[i];
    const rawEnd = Math.min(sorted[i + 1][0], now);
    // A long gap is unobserved; never turn a stalled workflow into uptime.
    if (rawEnd <= rawStart || rawEnd - rawStart > MAX_GAP) continue;
    const start = Math.max(rawStart, cutover);
    if (rawEnd > start) intervals.push([start, rawEnd, status, 'upptime']);
  }
  return aggregateIntervals(intervals, now, days);
}

function aggregateIntervals(intervals, now, days = new Map()) {
  const periods = [DAY, 7 * DAY, 30 * DAY].map(duration => ({duration, up: 0, total: 0}));
  for (const [rawStart, rawEnd, status, source] of intervals) {
    const start = rawStart, end = Math.min(rawEnd, now);
    if (end <= start) continue;
    for (const period of periods) {
      const duration = Math.max(0, end - Math.max(start, now - period.duration));
      period.total += duration;
      if (status === 'up') period.up += duration;
    }
    for (let cursor = start; cursor < end;) {
      const date = jstDate(cursor);
      const midnight = Date.parse(date + 'T00:00:00+09:00') + DAY;
      const stop = Math.min(end, midnight);
      const day = days.get(date) || {date, checks: null, failed: 0, upSeconds: 0, observedSeconds: 0, sources: []};
      const seconds = (stop - cursor) / 1000;
      day.observedSeconds += seconds;
      if (status === 'up') day.upSeconds += seconds;
      // Historical checks are unavailable. Count historical outage intervals,
      // rather than inventing five-minute check samples or a check count.
      if (source === 'uptimerobot' && status !== 'up') day.failed++;
      if (status === 'degraded') day.partialSeconds = (day.partialSeconds || 0) + seconds;
      if (!day.sources.includes(source)) day.sources.push(source);
      days.set(date, day);
      cursor = stop;
    }
  }
  return {
    periods: periods.map(p => ({days: p.duration / DAY, uptime: p.total ? +(p.up / p.total * 100).toFixed(3) : null, observedSeconds: Math.round(p.total / 1000)})),
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
