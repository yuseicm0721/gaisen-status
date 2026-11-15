export const monitors = [
  {slug: 'website', name: 'ウェブサイト', description: '街宣情報の閲覧', url: 'https://gaisen.1mr.jp/'},
  {slug: 'news', name: 'ニュース', description: 'ニュースの閲覧', url: 'https://gaisen.1mr.jp/news'},
];
const DAY = 86400000;
const MAX_GAP = 15 * 60000;
export const jstDate = time => new Date(time + 9 * 3600000).toISOString().slice(0, 10);
export function summarize(samples, now) {
  const sorted = [...samples].sort((a, b) => a[0] - b[0]);
  const periods = [DAY, 7 * DAY, 30 * DAY].map(duration => ({duration, up: 0, total: 0}));
  const days = new Map();
  for (const sample of sorted) {
    const date = jstDate(sample[0]);
    const day = days.get(date) || {date, checks: 0, failed: 0, upSeconds: 0, observedSeconds: 0};
    day.checks++;
    if (sample[1] !== 'up') day.failed++;
    days.set(date, day);
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const [start, status] = sorted[i];
    const end = Math.min(sorted[i + 1][0], now);
    // A long gap is unobserved; never turn a stalled workflow into uptime.
    if (end <= start || end - start > MAX_GAP) continue;
    for (const period of periods) {
      const duration = Math.max(0, end - Math.max(start, now - period.duration));
      period.total += duration;
      if (status === 'up') period.up += duration;
    }
    for (let cursor = start; cursor < end;) {
      const date = jstDate(cursor);
      const midnight = Date.parse(date + 'T00:00:00+09:00') + DAY;
      const stop = Math.min(end, midnight);
      const day = days.get(date) || {date, checks: 0, failed: 0, upSeconds: 0, observedSeconds: 0};
      day.observedSeconds += (stop - cursor) / 1000;
      if (status === 'up') day.upSeconds += (stop - cursor) / 1000;
      days.set(date, day);
      cursor = stop;
    }
  }
  return {
    periods: periods.map(p => ({days: p.duration / DAY, uptime: p.total ? +(p.up / p.total * 100).toFixed(3) : null, observedSeconds: Math.round(p.total / 1000)})),
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
