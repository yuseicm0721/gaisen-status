import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeMaintenanceFeed,scheduledCheck} from '../src/worker.js';
import {publicData} from '../src/monitor-state.js';
import {exportMaintenance} from '../scripts/export-maintenance.mjs';
const now=Date.now();
const old={id:'cf-1',type:'outage',source:'cloudflare',startedAt:new Date(now-3600000).toISOString(),state:'closed',code:530};
const notice=(id,state='open')=>({id,source:'upptime',type:'maintenance',services:['ガイセンNOW'],title:'メンテナンス',state,startedAt:new Date(now-100000).toISOString(),resolvedAt:state==='closed'?new Date(now-1000).toISOString():null,url:'https://github.com/yuseicm0721/gaisen-status/issues/'+id});
const feed=incidents=>({version:1,generatedAt:new Date(now).toISOString(),incidents});

test('a complete empty feed clears a previous fetch warning while preserving outage history',()=>{
 const state={incidents:[old,notice(3)],maintenanceAvailable:false};
 const next=mergeMaintenanceFeed(state,feed([]),now);
 assert.equal(next.maintenanceAvailable,true);
 assert.deepEqual(next.incidents,[old]);
 assert.equal(next.maintenanceSourceUpdatedAt,feed([]).generatedAt);
 assert.equal(state.incidents.length,2);
});
test('maintenance additions and recovery replace only manual notices',()=>{
 const next=mergeMaintenanceFeed({incidents:[old,notice(3)]},feed([notice(3,'closed'),notice(4)]),now);
 assert.equal(next.incidents.length,3);
 assert.equal(next.incidents.find(i=>i.id===3).state,'closed');
 assert.equal(next.incidents.find(i=>i.id==='cf-1').code,530);
});
test('stale, future, malformed or duplicate feeds cannot erase existing notices',()=>{
 const state={incidents:[old,notice(3)]};
 for(const invalid of [{...feed([]),generatedAt:new Date(now-7*3600000).toISOString()},{...feed([]),generatedAt:new Date(now+600000).toISOString()},feed([notice(3),notice(3)]),feed([{...notice(3),url:'https://example.com/'}]),{...feed([]),incidents:null}])assert.throws(()=>mergeMaintenanceFeed(state,invalid,now));
 assert.equal(state.incidents.length,2);
});
test('export paginates all notices, excludes pull requests and exports no private fields',async()=>{
 const issue=id=>({number:id,title:'お知らせ '+id,state:'open',created_at:new Date(now-10000).toISOString(),closed_at:null,html_url:'https://github.com/yuseicm0721/gaisen-status/issues/'+id,body:'not exported',user:{email:'not exported'}});
 let calls=0;
 const output=await exportMaintenance({token:'test-only',now,request:async(url,options)=>{
  calls++;assert.ok(url.endsWith('page='+calls));assert.equal(options.headers.Authorization,'Bearer test-only');
  return Response.json(calls===1?Array.from({length:100},(_,i)=>issue(i+1)):[issue(101),{...issue(102),pull_request:{}}]);
 }});
 assert.equal(calls,2);assert.equal(output.incidents.length,101);assert.equal(JSON.stringify(output).includes('not exported'),false);assert.equal(JSON.stringify(output).includes('test-only'),false);
});
test('an API export failure fails rather than publishing an empty success',async()=>{
 await assert.rejects(exportMaintenance({request:async()=>new Response('denied',{status:403})}),/HTTP 403/);
});
test('the scheduled monitor synchronizes the public feed and retains records on failure',async()=>{
 const original=globalThis.fetch;
 const state={schemaVersion:1,generatedAt:new Date(now-300000).toISOString(),service:{name:'ガイセンNOW',slug:'gaisen-now'},latest:{status:'up',code:200,checkedAt:new Date(now-300000).toISOString(),responseTime:10},intervals:[],days:{},incidents:[old,notice(3)],activeIncident:null,maintenanceAvailable:false};
 let fail=false,saved;
 globalThis.fetch=async url=>{
  if(url==='https://gaisen.1mr.jp/')return new Response('ガイセンNOW');
  assert.equal(url,'https://raw.githubusercontent.com/yuseicm0721/gaisen-status/main/maintenance.json');
  return fail?new Response('error',{status:503}):Response.json(feed([notice(3,'closed')]));
 };
 try {
  const env={STATUS_STORE:{get:async()=>structuredClone(state),put:async(k,v)=>saved=JSON.parse(v)}};
  await scheduledCheck(env);assert.equal(saved.maintenanceAvailable,true);assert.equal(saved.incidents.find(i=>i.id===3).state,'closed');assert.equal(saved.latest.code,200);
  fail=true;await scheduledCheck(env);assert.equal(saved.maintenanceAvailable,false);assert.equal(saved.incidents.find(i=>i.id===3).state,'open');assert.equal(saved.latest.code,200);assert.match(saved.maintenanceSyncError,/HTTP 503/);
 }finally{globalThis.fetch=original;}
});
test('public data warns when a previously valid maintenance feed has stopped updating',()=>{
 const state={schemaVersion:1,service:{name:'ガイセンNOW'},latest:{status:'up',checkedAt:new Date(now).toISOString()},intervals:[],days:{},incidents:[old],maintenanceAvailable:true,maintenanceSourceUpdatedAt:new Date(now-7*3600000).toISOString()};
 assert.equal(publicData(state,now).incidentsAvailable,false);
 assert.equal(publicData(state,now).service.status,'up');
 assert.equal(publicData(state,now).incidents[0].code,530);
});
