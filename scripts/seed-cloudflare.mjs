import {readFile,writeFile} from 'node:fs/promises';
import {archiveIntervals} from './status-model.mjs';
import {compactIntervals,publicData} from '../src/monitor-state.js';
const data=JSON.parse(await readFile('status-data.json','utf8'));
const checks=JSON.parse(await readFile('history/checks.json','utf8'))['gaisen-now'];
const archive=JSON.parse(await readFile('history/imported/uptimerobot-800442063.json','utf8'));
const intervals=archiveIntervals(archive),cutover=Date.parse(archive.coverage.end);
for(let i=0;i<checks.length-1;i++) {
 const [start,status]=checks[i],end=checks[i+1][0];
 if(end<=start || end-start>900000 || end<=cutover)continue;
 intervals.push([Math.max(start,cutover),end,status,'upptime']);
}
const {days,periods,...service}=data.service;
const counts=Object.fromEntries(days.map(d=>[d.date,{checks:null,failed:0}]));
for(const [time,status] of checks) {
 if(time<cutover)continue;
 const date=new Date(time+9*3600000).toISOString().slice(0,10),d=counts[date] || {checks:0,failed:0};
 counts[date]={checks:(d.checks || 0)+1,failed:d.failed+(status==='up'?0:1)};
}
const state={schemaVersion:1,generatedAt:data.generatedAt,service,latest:Object.fromEntries(['status','code','checkedAt','responseTime'].map(k=>[k,service[k]])),intervals:compactIntervals(intervals),days:counts,incidents:data.incidents,historicalImport:data.historicalImport,activeIncident:data.incidents.find(i=>i.type==='incident' && i.state==='open')?.id || null,maintenanceAvailable:data.incidentsAvailable,maintenanceSyncedAt:0};
const rebuilt=publicData(state,Date.parse(data.generatedAt));
for(const period of data.service.periods) {
 const actual=rebuilt.service.periods.find(p=>p.days===period.days);
 if(actual.uptime!==period.uptime || actual.observedSeconds!==period.observedSeconds)throw new Error('Seed does not match original statistics');
}
await writeFile('history/cloudflare-seed.json',JSON.stringify(state)+'\n');
console.log('Preserved '+checks.length+' checks as '+state.intervals.length+' exact observed intervals; '+state.incidents.length+' notices.');
