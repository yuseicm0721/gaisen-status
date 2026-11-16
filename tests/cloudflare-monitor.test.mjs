import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compactIntervals,recordResult,publicData} from '../src/monitor-state.js';
import {summarize} from '../scripts/status-model.mjs';
import worker,{scheduledCheck} from '../src/worker.js';
const seed=JSON.parse(readFileSync(new URL('../history/cloudflare-seed.json',import.meta.url)));
const T=Date.parse('2026-11-16T00:00:00Z');
const result=(minutes,status='up',code=200)=>({checkedAt:new Date(T+minutes*60000).toISOString(),status,code,responseTime:100});
const empty=()=>({schemaVersion:1,generatedAt:new Date(T).toISOString(),service:{name:'ガイセンNOW',slug:'gaisen-now'},latest:result(0),intervals:[],days:{},incidents:[],historicalImport:null,activeIncident:null,maintenanceSyncedAt:Date.now()});

test('stored history retains all imported notices and original rolling statistics',()=>{
 const original=JSON.parse(readFileSync(new URL('../status-data.json',import.meta.url)));
 const reconstructed=publicData(seed,Date.parse(seed.generatedAt));
 assert.equal(seed.incidents.filter(i=>i.source==='uptimerobot').length,26);
 // Compare at the seed's own cutoff rather than against a later bot update.
 const archive=JSON.parse(readFileSync(new URL('../history/imported/uptimerobot-800442063.json',import.meta.url)));
 const checks=JSON.parse(readFileSync(new URL('../history/checks.json',import.meta.url)))['gaisen-now'].filter(c=>c[0]<=Date.parse(seed.latest.checkedAt));
 const expected=summarize(checks,Date.parse(seed.generatedAt),archive);
 assert.deepEqual(reconstructed.service.periods,expected.periods);
 assert.deepEqual(reconstructed.service.days.map(d=>[d.date,d.observedSeconds,d.upSeconds,d.failed]),expected.days.map(d=>[d.date,d.observedSeconds,d.upSeconds,d.failed]));
 assert.ok(reconstructed.service.days.some(d=>d.date==='2026-08-18'));
 assert.equal(reconstructed.incidents.length,27);
 assert.equal(reconstructed.service.name,original.service.name);
});
test('compaction preserves observed intervals without filling gaps or overlaps',()=>{
 assert.deepEqual(compactIntervals([[0,10,'up','a'],[10,20,'up','a'],[25,30,'up','a'],[30,40,'down','a']]),[[0,20,'up','a'],[25,30,'up','a'],[30,40,'down','a']]);
 assert.throws(()=>compactIntervals([[0,20,'up','a'],[10,30,'up','a']]),/Overlapping/);
});
test('each autonomous check advances recorded history and aggregates elapsed time once',()=>{
 let state=empty();state=recordResult(state,result(5));state=recordResult(state,result(10));
 assert.equal(state.intervals.length,1);
 assert.deepEqual(state.intervals[0],[T,T+600000,'up','cloudflare']);
 const output=publicData(state,T+600000);
 assert.equal(output.sourceMonitoring,'cloudflare');
 assert.equal(output.generatedAt,result(10).checkedAt);
 assert.equal(output.service.periods[0].observedSeconds,600);
 assert.equal(output.service.periods[0].uptime,100);
 assert.equal(output.service.days[0].checks,2);
});
test('missed scheduled intervals stay unknown rather than becoming healthy uptime',()=>{
 let state=recordResult(empty(),result(5));state=recordResult(state,result(40));
 assert.equal(publicData(state,T+2400000).service.periods[0].observedSeconds,300);
 assert.throws(()=>recordResult(state,result(39)),/out-of-order/);
});
test('one outage notice retains the initial error, additional codes and real recovery time',()=>{
 let state=recordResult(empty(),result(5,'down',530));
 state=recordResult(state,result(10,'down',503));
 assert.equal(state.incidents.length,1);
 assert.equal(state.incidents[0].code,530);
 assert.deepEqual(state.incidents[0].codes,[530,503]);
 assert.equal(state.incidents[0].state,'open');
 state=recordResult(state,result(15));
 assert.equal(state.incidents[0].state,'closed');
 assert.equal(state.incidents[0].resolvedAt,result(15).checkedAt);
 assert.equal(state.incidents[0].code,530);
 assert.equal(publicData(state,T+900000).service.periods[0].uptime,33.333);
});
test('continuous intervals split correctly at Japan midnight',()=>{
 const state=empty();state.intervals=[[Date.parse('2026-11-15T14:55:00Z'),Date.parse('2026-11-15T15:05:00Z'),'down','cloudflare']];
 const output=publicData(state,Date.parse('2026-11-15T15:05:00Z'));
 assert.deepEqual(output.service.days.map(d=>[d.date,d.observedSeconds,d.upSeconds]),[['2026-11-15',300,0],['2026-11-16',300,0]]);
});
test('autonomous monitoring retries a transient failure and persists only actual recovered status',async()=>{
 const original=globalThis.fetch;let attempts=0,saved;
 const state=empty();state.latest.checkedAt=new Date(Date.now()-300000).toISOString();
 globalThis.fetch=async url=>{assert.equal(url,'https://gaisen.1mr.jp/');attempts++;return attempts===1?new Response('error',{status:530}):new Response('ガイセンNOW');};
 try{
  const output=await scheduledCheck({STATUS_STORE:{get:async()=>state,put:async(key,value)=>{assert.equal(key,'state');saved=JSON.parse(value);}}});
  assert.equal(attempts,2);assert.equal(saved.latest.status,'up');assert.equal(saved.latest.code,200);assert.equal(output.generatedAt,saved.latest.checkedAt);
  assert.equal(saved.incidents.length,0);
 }finally{globalThis.fetch=original;}
});
test('a persistent error is saved as an outage after all three attempts',async()=>{
 const original=globalThis.fetch;let attempts=0,saved;
 const state=empty();state.latest.checkedAt=new Date(Date.now()-300000).toISOString();
 globalThis.fetch=async()=>{attempts++;return new Response('error',{status:503});};
 try{
  await scheduledCheck({STATUS_STORE:{get:async()=>state,put:async(key,value)=>saved=JSON.parse(value)}});
  assert.equal(attempts,3);assert.equal(saved.latest.status,'down');assert.equal(saved.incidents[0].code,503);assert.equal(saved.incidents.length,1);
 }finally{globalThis.fetch=original;}
});
test('the public data endpoint uses persistent monitoring rather than GitHub or a page-view probe',async()=>{
 const original=globalThis.fetch,cache=globalThis.caches;
 const state=empty();state.latest.checkedAt=new Date().toISOString();state.generatedAt=state.latest.checkedAt;
 globalThis.fetch=async()=>{throw new Error('External sources must not be called');};
 globalThis.caches={default:{match:async()=>null,put:async()=>{}}};
 try{
  const response=await worker.fetch(new Request('https://gaisen.1mr.jp/status/data.json'),{STATUS_STORE:{get:async()=>state}},{waitUntil:()=>{}});
  assert.equal(response.status,200);const d=await response.json();assert.equal(d.sourceMonitoring,'cloudflare');assert.equal(d.liveVerification,undefined);assert.equal(d.service.checkedAt,state.latest.checkedAt);
 }finally{globalThis.fetch=original;globalThis.caches=cache;}
});
