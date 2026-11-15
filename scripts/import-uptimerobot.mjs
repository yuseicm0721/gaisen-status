import {readFile, writeFile, mkdir, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// One-time import of a locally saved, public status-page response. This script
// never uses an API key and is not run by the monitoring workflow.
export function importSnapshot(snapshot, {cutover, fetchedAt}) {
  const monitor = snapshot.monitor;
  if (snapshot.status !== 'ok' || monitor?.monitorId !== 800442063 || monitor.name !== 'ガイセンNOW' || monitor.type !== 'HTTP(s)') throw new Error('Unexpected source monitor');
  if (!Array.isArray(monitor.dailyRatios) || !monitor.dailyRatios.length) throw new Error('Missing daily uptime history');
  const events = [...monitor.logs].sort((a, b) => a.time - b.time);
  const incidents = [];
  let down = null;
  for (const event of events) {
    if (!Number.isFinite(event.time)) throw new Error('Invalid source timestamp');
    if (event.label === 'down') {
      if (down) throw new Error('Unpaired downtime event');
      down = event;
    } else if (event.label === 'up') {
      if (!down || event.time <= down.time) throw new Error('Unpaired recovery event');
      incidents.push({
        id: 'uptimerobot-800442063-' + down.time,
        source: 'uptimerobot', type: 'incident', services: ['ウェブサイト'], state: 'closed',
        startedAt: new Date(down.time * 1000).toISOString(), resolvedAt: new Date(event.time * 1000).toISOString(),
        durationSeconds: event.time - down.time, code: String(down.reason?.code ?? ''),
      });
      down = null;
    } else if (event.label !== 'started') throw new Error('Unsupported source state: ' + event.label);
  }
  if (down) throw new Error('Unresolved source outage requires manual review');
  const coverageStart = Date.parse(monitor.dailyRatios[0].date + 'T00:00:00Z');
  const end = Date.parse(cutover), captured = Date.parse(fetchedAt);
  const lastDayEnd = Date.parse(monitor.dailyRatios.at(-1).date + 'T00:00:00Z') + 86400000;
  if (!(coverageStart < end && end <= captured && end <= lastDayEnd)) throw new Error('Cutover is outside the source coverage');
  for (let i = 0; i < monitor.dailyRatios.length; i++) {
    const day = monitor.dailyRatios[i], start = Date.parse(day.date + 'T00:00:00Z');
    if (start !== coverageStart + i * 86400000) throw new Error('Noncontiguous daily history');
    const ratio = Number(day.ratio);
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 100) throw new Error('Invalid daily ratio');
    const seconds = incidents.reduce((sum, event) => sum + Math.max(0, Math.min(start + 86400000, Date.parse(event.resolvedAt)) - Math.max(start, Date.parse(event.startedAt))) / 1000, 0);
    // The daily ratios use UTC dates, even though event display times use JST.
    // Their precision is 0.001%. Validate full UTC days against exact events
    // before reconstructing the same known intervals in Japan time.
    if (start + 86400000 > captured && (seconds !== 0 || ratio !== 100)) throw new Error('Partial current-day downtime needs manual review');
    if (Math.abs((100 - seconds / 86400 * 100) - ratio) > 0.001) throw new Error('Daily ratio disagrees with event history: ' + day.date);
  }
  return {
    version: 1, source: 'uptimerobot', monitorId: monitor.monitorId,
    sourceUrl: 'https://stats.uptimerobot.com/yAGp5S796R/800442063',
    publicApiUrl: 'https://stats.uptimerobot.com/api/getMonitor/yAGp5S796R?m=800442063',
    fetchedAt, sourceTimezone: snapshot.timezone, sourceDailyRatioTimezone: 'UTC', displayTimezone: 'Asia/Tokyo',
    coverage: {start: new Date(coverageStart).toISOString(), end: new Date(end).toISOString()},
    validation: {dailyRatiosCompared: monitor.dailyRatios.length, matched: true, tolerancePercentagePoints: 0.001},
    incidents,
    dailyRatios: monitor.dailyRatios,
    sourceRatios: Object.fromEntries(['1dRatio', '7dRatio', '30dRatio', '90dRatio'].map(k => [k, monitor[k]])),
  };
}

if (process.argv[1]?.endsWith('/import-uptimerobot.mjs')) {
  const path = process.argv[2];
  if (!path) throw new Error('Pass the saved public JSON response path');
  const raw = await readFile(path);
  const snapshot = JSON.parse(raw);
  const ledger = JSON.parse(await readFile('history/checks.json', 'utf8'));
  const cutover = new Date(Math.min(...ledger.website.map(sample => sample[0]))).toISOString();
  const fetchedAt = (await stat(path)).mtime.toISOString();
  const archive = importSnapshot(snapshot, {cutover, fetchedAt});
  archive.sourceSha256 = createHash('sha256').update(raw).digest('hex');
  await mkdir('history/imported', {recursive:true});
  // Keep a public source snapshot so the import is independently reviewable.
  await writeFile('history/imported/uptimerobot-800442063-source.json', raw);
  await writeFile('history/imported/uptimerobot-800442063.json', JSON.stringify(archive, null, 2) + '\n');
  console.log(JSON.stringify({coverage:archive.coverage, incidents:archive.incidents.length, validation:archive.validation}));
}
