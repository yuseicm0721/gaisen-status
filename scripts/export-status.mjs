import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {monitors, summarize, summarizeCombined, combinedStatus} from './status-model.mjs';
const now = Date.now();
await mkdir('history', {recursive: true});
let ledger = {};
try { ledger = JSON.parse(await readFile('history/checks.json', 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
let archive = null;
try { archive = JSON.parse(await readFile('history/imported/uptimerobot-800442063.json', 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const services = [];
for (const monitor of monitors) {
  const text = await readFile(`history/${monitor.slug}.yml`, 'utf8');
  const history = Object.fromEntries(text.split('\n').filter(l => l.includes(': ')).map(l => [l.slice(0, l.indexOf(': ')), l.slice(l.indexOf(': ') + 2)]));
  const checked = Date.parse(history.lastUpdated);
  if (!Number.isFinite(checked) || !['up', 'down', 'degraded'].includes(history.status)) throw new Error('Invalid monitoring result: ' + monitor.slug);
  const samples = (ledger[monitor.slug] || []).filter(s => s[0] > now - 91 * 86400000 && s[0] !== checked);
  samples.push([checked, history.status, +history.responseTime]);
  ledger[monitor.slug] = samples.sort((a, b) => a[0] - b[0]);
  const historical = monitor.slug === 'website' ? archive : null;
  services.push({...monitor, status: history.status, code: +history.code, responseTime: +history.responseTime, checkedAt: history.lastUpdated, startedAt: history.startTime,
    historyStartedAt: historical ? historical.coverage.start : history.startTime,
    ...summarize(samples, now, historical)});
}
let incidents = [], incidentsAvailable = true;
try {
  const headers = {'Accept': 'application/vnd.github+json', 'User-Agent': 'GaisenNOW-Status'};
  if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  const response = await fetch('https://api.github.com/repos/yuseicm0721/gaisen-status/issues?state=all&sort=created&direction=desc&per_page=100', {headers, signal: AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error('GitHub incidents HTTP ' + response.status);
  incidents = (await response.json()).filter(issue => !issue.pull_request && issue.labels.some(l => ['status', 'maintenance'].includes(l.name))).slice(0, 30).map(issue => ({
    id: issue.number, type: issue.labels.some(l => l.name === 'maintenance') ? 'maintenance' : 'incident',
    services: monitors.filter(m => issue.labels.some(l => l.name === m.slug)).map(m => m.name),
    title: issue.labels.some(l => l.name === 'maintenance') ? issue.title : null,
    state: issue.state, startedAt: issue.created_at, resolvedAt: issue.closed_at, url: issue.html_url,
  }));
} catch (error) { incidentsAvailable = false; console.warn(error.message); }
if (archive) incidents.push(...archive.incidents);
incidents.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
await writeFile('history/checks.json', JSON.stringify(ledger) + '\n');
const historicalImport = archive ? {source: archive.source, coverage: archive.coverage, incidentCount: archive.incidents.length, importedAt: archive.fetchedAt} : null;
const start = Math.max(...services.map(s => Date.parse(s.startedAt)));
const service = {
  slug: 'gaisen-now', name: 'ガイセンNOW', description: '街宣情報・ニュースの閲覧',
  status: combinedStatus(services.map(s => s.status)),
  checkedAt: new Date(Math.min(...services.map(s => Date.parse(s.checkedAt)))).toISOString(),
  responseTime: Math.max(...services.map(s => s.responseTime)),
  startedAt: new Date(start).toISOString(),
  historyStartedAt: archive ? archive.coverage.start : new Date(start).toISOString(),
  ...summarizeCombined(monitors.map(m => ledger[m.slug]), now, archive),
};
await writeFile('status-data.json', JSON.stringify({version: 1, generatedAt: new Date(now).toISOString(), intervalMinutes: 5, service, services, incidents, incidentsAvailable, historicalImport}, null, 2) + '\n');
console.log('Exported ' + services.length + ' monitors; incidents available: ' + incidentsAvailable);
