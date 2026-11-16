const DAY = 86400000;
const MAX_GAP = 15 * 60000;
const RETENTION = 91 * DAY;
const dayOf = value => new Date(value + 9 * 3600000).toISOString().slice(0,10);

export function compactIntervals(intervals) {
  const result=[];
  for (const entry of [...intervals].sort((a,b)=>a[0]-b[0])) {
    const [start,end,status,source]=entry;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !['up','down','degraded'].includes(status)) throw new Error('Invalid observed interval');
    const last=result.at(-1);
    if (last && start < last[1]) throw new Error('Overlapping observed intervals');
    if (last && start === last[1] && status === last[2] && source === last[3]) last[1]=end;
    else result.push([...entry]);
  }
  return result;
}

export function recordResult(state, result) {
  const time=Date.parse(result.checkedAt), previous=Date.parse(state.latest.checkedAt);
  if (!Number.isFinite(time) || time <= previous || !['up','down','degraded'].includes(result.status) || !Number.isInteger(result.code)) throw new Error('Invalid or out-of-order check');
  const next={...state, latest:{...result}, generatedAt:result.checkedAt, intervals:state.intervals.map(i=>[...i]), days:{...state.days}, incidents:state.incidents.map(i=>({...i,codes:i.codes?[...i.codes]:undefined}))};
  if (time-previous <= MAX_GAP) {
    const last=next.intervals.at(-1);
    if (last && last[1]===previous && last[2]===state.latest.status && last[3]==='cloudflare') last[1]=time;
    else next.intervals.push([previous,time,state.latest.status,'cloudflare']);
  }
  const date=dayOf(time), counts=next.days[date] || {checks:0,failed:0};
  next.days[date]={checks:(counts.checks || 0)+1,failed:(counts.failed || 0)+(result.status==='up'?0:1)};
  let incident=next.incidents.find(i=>i.id===next.activeIncident);
  if (result.status!=='up') {
    if (!incident || incident.state!=='open') {
      incident={id:'cloudflare-'+time,source:'cloudflare',type:'incident',services:['ガイセンNOW'],title:null,state:'open',startedAt:result.checkedAt,resolvedAt:null,code:result.code,codes:[result.code],status:result.status};
      next.incidents.unshift(incident);next.activeIncident=incident.id;
    } else {
      incident.codes=[...new Set([...(incident.codes || [incident.code]),result.code])];
    }
  } else if (incident?.state==='open') {
    incident.state='closed';incident.resolvedAt=result.checkedAt;next.activeIncident=null;
  }
  next.intervals=next.intervals.filter(i=>i[1]>time-RETENTION).map(i=>[Math.max(i[0],time-RETENTION),...i.slice(1)]);
  const cutoff=dayOf(time-RETENTION);
  next.days=Object.fromEntries(Object.entries(next.days).filter(([date])=>date>=cutoff));
  next.incidents=next.incidents.sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt)).slice(0,200);
  return next;
}

export function publicData(state, now=Date.now()) {
  if (state.schemaVersion!==1 || !state.latest || !Array.isArray(state.intervals)) throw new Error('Invalid stored monitoring state');
  const days=new Map(Object.entries(state.days).map(([date,counts])=>[date,{date,checks:counts.checks,failed:counts.failed,upSeconds:0,observedSeconds:0,partialSeconds:0,sources:[]} ]));
  const periods=[1,7,30].map(days=>({days,up:0,total:0}));
  for (const [start,rawEnd,status,source] of state.intervals) {
    const end=Math.min(rawEnd,now);
    if (end<=start) continue;
    for (const p of periods) {
      const length=Math.max(0,end-Math.max(start,now-p.days*DAY));
      p.total+=length;if(status==='up') p.up+=length;
    }
    for(let cursor=start;cursor<end;) {
      const date=dayOf(cursor),stop=Math.min(end,Date.parse(date+'T00:00:00+09:00')+DAY);
      const d=days.get(date) || {date,checks:null,failed:0,upSeconds:0,observedSeconds:0,partialSeconds:0,sources:[]};
      const seconds=(stop-cursor)/1000;d.observedSeconds+=seconds;
      if(status==='up')d.upSeconds+=seconds;
      if(status==='degraded')d.partialSeconds=(d.partialSeconds || 0)+seconds;
      if(source==='uptimerobot' && status!=='up')d.failed++;
      if(!d.sources.includes(source))d.sources.push(source);
      days.set(date,d);cursor=stop;
    }
  }
  const service={...state.service,...state.latest,periods:periods.map(p=>({days:p.days,uptime:p.total?+(p.up/p.total*100).toFixed(3):null,observedSeconds:Math.round(p.total/1000)})),days:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date))};
  return {version:1,sourceMonitoring:'cloudflare',generatedAt:state.generatedAt,intervalMinutes:5,service,services:[service],incidents:state.incidents,incidentsAvailable:state.maintenanceAvailable!==false,historicalImport:state.historicalImport};
}
