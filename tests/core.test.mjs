import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {score,parseAnswers,markdownReport,describeDimension} from '../core.mjs';
const bank=JSON.parse(readFileSync(new URL('../data.json',import.meta.url),'utf8'));
const fixtures=JSON.parse(readFileSync(new URL('./python-parity.json',import.meta.url),'utf8'));
test('web scores and report inputs equal Python reference for 109 synthetic fixtures',()=>{
  assert.equal(fixtures.length,109);
  for(const [index,f] of fixtures.entries()){
    const actual=score(f.answers,bank);
    assert.deepEqual(actual,f.result,`fixture ${index}`);
  }
});
test('neutral and directional cancellation have distinct interpretations',()=>{
  const neutral=score(Object.fromEntries(bank.items.map(i=>[i.id,3])),bank);
  const mixed=score(Object.fromEntries(bank.items.map(i=>[i.id,5])),bank);
  assert.equal(neutral.dimensions[0].score,50);assert.equal(mixed.dimensions[0].score,50);
  assert.match(describeDimension(neutral.dimensions[0]),/中立/);
  assert.match(describeDimension(mixed.dimensions[0]),/双向选择/);
});
test('imports reject malformed, unexpected and duplicate values without scoring them',()=>{
  for(const input of ['[]','null','{"D1_01":true}','{"D1_01":"3"}','{"D1_01":0}','{"D1_09":3}','{"S01":3}','{"F01":"U"}','{"D1_01":3,"D1_01":5}','{"D1_01":3,"\\u00441_01":5}','{"__proto__":{}}'])assert.throws(()=>parseAnswers(input,bank),input);
  assert.deepEqual(parseAnswers('{"D1_01":3,"S01":"B","F01":2}',bank),{D1_01:3,S01:'B',F01:2});
});
test('all active items appear once in the order; every page core block balances direction',()=>{
  assert.equal(bank.administration_order.length,96);
  assert.equal(new Set(bank.administration_order).size,96);
  for(let start=0;start<80;start+=20){const rows=bank.items.filter(i=>bank.administration_order.slice(start,start+20).includes(i.id));assert.equal(rows.length,20);assert.equal(rows.reduce((s,i)=>s+i.direction,0),0);}
});
test('download report includes caveats, missingness and scenario choices',()=>{
  const report=markdownReport(score({S01:'A',S02:'B'},bank));
  assert.match(report,/信息不足/);assert.match(report,/条件变化后选择不同/);assert.match(report,/未经校准/);
  assert.doesNotMatch(report,/undefined|NaN/);
});
