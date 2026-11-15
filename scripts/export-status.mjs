import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {monitors, summarize} from './status-model.mjs';
const now = Date.now();
await mkdir('history', {recursive: true});
let ledger = {};
try { ledger = JSON.parse(await readFile('history/checks.json', 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const services = [];
for (const monitor of monitors) {
  const text = await readFile(`history/${monitor.slug}.yml`, 'utf8');
  const history = Object.fromEntries(text.split('\n').filter(l => l.includes(': ')).map(l => [l.slice(0, l.indexOf(': ')), l.slice(l.indexOf(': ') + 2)]));
  const checked = Date.parse(history.lastUpdated);
  if (!Number.isFinite(checked) || !['up', 'down', 'degraded'].includes(history.status)) throw new Error('Invalid monitoring result: ' + monitor.slug);
  const samples = (ledger[monitor.slug] || []).filter(s => s[0] > now - 91 * 86400000 && s[0] !== checked);
  samples.push([checked, history.status, +history.responseTime]);
  ledger[monitor.slug] = samples.sort((a, b) => a[0] - b[0]);
  services.push({...monitor, status: history.status, code: +history.code, responseTime: +history.responseTime, checkedAt: history.lastUpdated, startedAt: history.startTime, ...summarize(samples, now)});
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
await writeFile('history/checks.json', JSON.stringify(ledger) + '\n');
await writeFile('status-data.json', JSON.stringify({version: 1, generatedAt: new Date(now).toISOString(), intervalMinutes: 5, services, incidents, incidentsAvailable}, null, 2) + '\n');
console.log('Exported ' + services.length + ' monitors; incidents available: ' + incidentsAvailable);
