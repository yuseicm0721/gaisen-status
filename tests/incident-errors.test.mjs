import test from 'node:test';
import assert from 'node:assert/strict';
import {incidentFromIssue} from '../scripts/incident-records.mjs';
import {groupPublicIncidents} from '../scripts/incident-groups.mjs';
import {normalizeCode, resultDescription} from '../docs/status-errors.js';
const issue = overrides => ({number:1,title:'🛑 ガイセンNOW is down',body:'- HTTP code: 530\n- Response time: 73 ms\n',labels:[{name:'status'},{name:'gaisen-now'}],state:'closed',created_at:'2026-11-15T19:31:04Z',closed_at:'2026-11-15T19:39:11Z',html_url:'https://github.com/yuseicm0721/gaisen-status/issues/1',...overrides});
test('actual Upptime result extracts HTTP 530 and preserves source metadata', () => {
  const record = incidentFromIssue(issue());
  assert.equal(record.code,530);
  assert.deepEqual(record.services,['ガイセンNOW']);
  assert.equal(record.state,'closed');
  assert.equal(resultDescription(record.code,record.status),'HTTP 530');
});
test('missing numbers are not inferred from the title, URL or current healthy result', () => {
  const record = incidentFromIssue(issue({title:'530 timeout',body:'See https://example.com/503; recovered HTTP 200'}));
  assert.equal(record.code,null);
  assert.equal(resultDescription(record.code,record.status),'エラー番号の記録なし');
  for (const value of ['',null,undefined,-1,'NaN',999,530.5]) assert.equal(normalizeCode(value),null);
});
test('connection failure is not represented as HTTP 0', () => {
  const record = incidentFromIssue(issue({body:'- HTTP code: 0\n'}));
  assert.equal(record.code,0);
  assert.match(resultDescription(record.code,record.status),/^HTTP応答なし/);
});
test('HTTP 200 failing body validation and slow responses are explained separately', () => {
  const invalid = incidentFromIssue(issue({body:'- HTTP code: 200\n'}));
  const slow = incidentFromIssue(issue({title:'⚠️ ガイセンNOW has degraded performance',body:'- HTTP code: 200\n'}));
  assert.match(resultDescription(invalid.code,invalid.status),/本文/);
  assert.match(resultDescription(slow.code,slow.status),/応答時間/);
  assert.equal(resultDescription(200,'up'),'HTTP 200');
});
test('legacy grouping retains distinct HTTP results and zero without inventing codes', () => {
  const a=incidentFromIssue(issue()),b=incidentFromIssue(issue({number:2,body:'- HTTP code: 503\n'})),c=incidentFromIssue(issue({number:3,body:'- HTTP code: 0\n'}));
  const grouped=groupPublicIncidents([a,b,c])[0];
  assert.deepEqual(grouped.codes,[530,503,0]);
  assert.deepEqual(grouped.records.map(r=>r.code),[530,503,0]);
});
test('maintenance notes do not become error notifications', () => {
  const record=incidentFromIssue(issue({labels:[{name:'maintenance'}],title:'メンテナンスのお知らせ'}));
  assert.equal(record.type,'maintenance');
  assert.equal(record.title,'メンテナンスのお知らせ');
  assert.equal('code' in record,false);
});
