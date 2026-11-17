// Additional read-only audit checks; no scoring or UI implementation changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseAnswers,validateAnswers,score,exportAnswers,markdownReport} from '../core.mjs';
import {questionnairePages} from '../flow.mjs';
import {RADAR_MODES,reportRadarSvg} from '../ui/radar.mjs';

const bank=JSON.parse(readFileSync(new URL('../data.json',import.meta.url),'utf8'));
const base=bank.items.filter(i=>i.status==='core');
const envelope=answers=>({format:'political-values-answers',version:bank.version,answers,clarifications:{}});

test('audit: malicious JSON keys and HTML-bearing answer values are rejected without prototype pollution',()=>{
  for(const payload of [
    '{"__proto__":{"polluted":true}}',
    '{"constructor":{"prototype":{"polluted":true}}}',
    '{"prototype":true}',
    '{"D1_01":"<img src=x onerror=alert(1)>"}',
    '{"S01":"javascript:alert(1)"}',
    '{"D1_01":1e309}',
    '{"D1_01":{}}',
    '{"D1_01":[]}',
    '{"D1_01":3,"\\u00441_01":5}',
  ]){
    const text=`{"format":"political-values-answers","version":"${bank.version}","answers":${payload},"clarifications":{}}`;
    assert.throws(()=>parseAnswers(text,bank),payload);
  }
  assert.equal({}.polluted,undefined);
});

test('audit: answer-size limits and cross-field question ownership are enforced',()=>{
  assert.throws(()=>parseAnswers(' '.repeat(100001),bank));
  assert.throws(()=>parseAnswers(JSON.stringify(envelope({C_D1:'compromise'})),bank));
  assert.throws(()=>parseAnswers(JSON.stringify({...envelope({}),clarifications:{D1_01:5}}),bank));
  for(const invalid of [true,1.5,0,6,'3',{},[],undefined,NaN,Infinity]){
    assert.throws(()=>validateAnswers({D1_01:invalid},bank));
  }
});

test('audit: deterministic random valid answer sets preserve bounds, counts, unique pages, roundtrips and input immutability',()=>{
  let seed=739391;
  const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  const choices=[1,2,3,4,5,'U','Q',null];
  for(let run=0;run<400;run++){
    const answers=Object.fromEntries(bank.items.map(q=>[q.id,choices[next()%choices.length]]));
    // Mix missing fields with explicit null values.
    for(const q of bank.items)if(next()%7===0)delete answers[q.id];
    const before=JSON.stringify(answers),r=score(answers,bank);
    for(const d of r.dimensions){
      assert.ok(d.score===null||(Number.isFinite(d.score)&&d.score>=0&&d.score<=100));
      assert.equal(Object.values(d.counts).reduce((s,v)=>s+v,0),d.total_items);
      assert.equal(d.answered,d.counts.left+d.counts.neutral+d.counts.right);
      assert.ok(d.base_answered>=6||d.score===null);
      assert.ok(d.supplemental_offered===0||d.supplemental_offered===4);
    }
    assert.ok(r.supplemental_offered<=40);
    const ids=questionnairePages(answers,bank).flatMap(p=>p.ids);
    assert.equal(ids.length,new Set(ids).size);
    assert.ok(ids.length<=146);
    assert.deepEqual(parseAnswers(JSON.stringify(exportAnswers(answers,bank)),bank),answers);
    assert.doesNotMatch(markdownReport(r),/undefined|NaN|Infinity/);
    assert.equal(JSON.stringify(answers),before);
  }
});

test('audit: visual projections leave original scores intact and exclude missing vertices',()=>{
  for(const value of [0,25,50,75,100]){
    assert.equal(RADAR_MODES.standard.map(value,0),value);
    assert.equal(RADAR_MODES.autonomy.map(value,0),100-value);
    assert.equal(RADAR_MODES.autonomy.map(value,1),100-value);
    assert.equal(RADAR_MODES.autonomy.map(value,2),value);
    assert.equal(RADAR_MODES.intensity.map(value,0),Math.abs(value-50)*2);
  }
  const r=score(Object.fromEntries(base.map(q=>[q.id,3])),bank);
  const before=JSON.stringify(r);
  for(const mode of Object.keys(RADAR_MODES))assert.doesNotMatch(reportRadarSvg(r.dimensions,null,mode),/NaN|Infinity/);
  assert.equal(JSON.stringify(r),before);
  const empty=score({},bank);
  assert.doesNotMatch(reportRadarSvg(empty.dimensions,null,'intensity'),/class="radar-vertex/);
});
