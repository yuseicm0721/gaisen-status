import test from 'node:test';
import assert from 'node:assert/strict';
import {groupPublicIncidents} from '../scripts/incident-groups.mjs';
const make = (id, service, start, end = null) => ({id, type:'incident', services:[service], title:null, state:end ? 'closed' : 'open', startedAt:start, resolvedAt:end, url:'https://github.com/yuseicm0721/gaisen-status/issues/' + id});
const t = seconds => new Date(Date.parse('2026-11-15T19:31:00Z') + seconds * 1000).toISOString();
test('overlapping legacy records produce one notification and retain both sources', () => {
  const first = make(1,'ガイセンNOW','2026-11-15T19:31:04Z','2026-11-15T19:39:11Z');
  const second = make(2,'ガイセンNOW','2026-11-15T19:31:19Z','2026-11-15T19:39:14Z');
  const result = groupPublicIncidents([second,first]);
  assert.equal(result.length,1);
  assert.equal(result[0].startedAt,first.startedAt);
  assert.equal(result[0].resolvedAt,'2026-11-15T19:39:14.000Z');
  assert.equal(result[0].state,'closed');
  assert.deepEqual(result[0].records.map(i=>i.id),[1,2]);
  assert.deepEqual(result[0].services,['ガイセンNOW']);
  assert.equal(result[0].url,first.url);
});
test('non-overlapping outages stay separate even if close in time', () => {
  assert.equal(groupPublicIncidents([make(1,'ガイセンNOW',t(0),t(20)),make(2,'ガイセンNOW',t(21),t(40))]).length,2);
});
test('a grouped incident stays open until all overlapping records recover', () => {
  const result = groupPublicIncidents([make(1,'ガイセンNOW',t(0),t(50)),make(2,'ガイセンNOW',t(10))]);
  assert.equal(result[0].state,'open');
  assert.equal(result[0].resolvedAt,null);
});
test('recovery is the latest end, rather than the last start', () => {
  const result = groupPublicIncidents([make(1,'ガイセンNOW',t(0),t(100)),make(2,'ガイセンNOW',t(10),t(30))]);
  assert.equal(result[0].resolvedAt,t(100));
});
test('maintenance and imported history remain independent', () => {
  const old = {...make('old','ガイセンNOW',t(0),t(50)),source:'uptimerobot'};
  const maintenance = {...make(3,'ガイセンNOW',t(0),t(50)),type:'maintenance',title:'予定されたメンテナンス'};
  const result = groupPublicIncidents([old,maintenance,make(1,'ガイセンNOW',t(0),t(50)),make(2,'ガイセンNOW',t(10),t(40))]);
  assert.equal(result.length,3);
  assert.ok(result.includes(old));
  assert.ok(result.includes(maintenance));
});
test('a continuous outage across legacy records forms one notification', () => {
  const result = groupPublicIncidents([make(1,'ガイセンNOW',t(0),t(30)),make(2,'ガイセンNOW',t(20),t(60)),make(3,'ガイセンNOW',t(50),t(90))]);
  assert.equal(result.length,1);
  assert.equal(result[0].records.length,3);
  assert.equal(result[0].resolvedAt,t(90));
});
test('malformed or unassigned records are not silently merged', () => {
  const bad = make(1,'ガイセンNOW','invalid',t(50));
  const unassigned = {...make(2,'ガイセンNOW',t(0),t(50)),services:[]};
  assert.equal(groupPublicIncidents([bad,unassigned,make(3,'ガイセンNOW',t(0),t(50))]).length,3);
});
test('grouping never mutates the source records', () => {
  const records = [make(1,'ガイセンNOW',t(0),t(50)),make(2,'ガイセンNOW',t(10),t(40))];
  const original = structuredClone(records);
  groupPublicIncidents(records);
  assert.deepEqual(records,original);
});
