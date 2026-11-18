import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {score,parseAnswers,markdownReport,describeDimension} from '../legacy/v1/core.mjs';
const bank=JSON.parse(readFileSync(new URL('../legacy/v1/data.json',import.meta.url),'utf8'));
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

test('each reference profile is recognized from actual answer choices',async()=>{
  const {IDEOLOGIES,closestIdeology}=await import('../legacy/v1/ideology.mjs');
  for(const p of IDEOLOGIES){
    const answers=Object.fromEntries(bank.items.map(i=>[i.id,3+(p.point[Number(i.dimension.slice(1))-1]-50)/25*i.direction]));
    const result=score(answers,bank),closest=closestIdeology(result);
    assert.equal(closest.id,p.id);assert.equal(closest.distance,0);
    assert.match(markdownReport(result),new RegExp(p.name));
  }
});
test('single summary requires valid scores on all ten dimensions',async()=>{
  const {closestIdeology}=await import('../legacy/v1/ideology.mjs');
  assert.equal(closestIdeology(score({},bank)).status,'insufficient');
  const answers=Object.fromEntries(bank.items.map(i=>[i.id,3]));
  delete answers.D1_01;delete answers.D1_02;
  assert.equal(closestIdeology(score(answers,bank)).status,'matched');
  delete answers.D1_03;
  const c=closestIdeology(score(answers,bank));assert.equal(c.status,'insufficient');assert.equal(c.missing,1);
});
test('neutral and mixed averages get distinct caveats; dimensional ordering is immaterial',async()=>{
  const {closestIdeology}=await import('../legacy/v1/ideology.mjs');
  const neutral=score(Object.fromEntries(bank.items.map(i=>[i.id,3])),bank);
  const mixed=score(Object.fromEntries(bank.items.map(i=>[i.id,5])),bank);
  assert.match(closestIdeology(neutral).caveats.join(''),/中立/);
  assert.match(closestIdeology(mixed).caveats.join(''),/双向选择/);
  assert.deepEqual(closestIdeology({...neutral,dimensions:[...neutral.dimensions].reverse()}),closestIdeology(neutral));
});
test('equal nearest distances select one reproducibly and disclose ambiguity',async()=>{
  const {closestIdeology}=await import('../legacy/v1/ideology.mjs');
  const result=score(Object.fromEntries(bank.items.map(i=>[i.id,3])),bank);
  // Midpoint between centrist and technocratic references.
  result.dimensions.find(d=>d.id==='D5').score=37.5;
  result.dimensions.find(d=>d.id==='D8').score=62.5;
  result.dimensions.find(d=>d.id==='D10').score=62.5;
  const c=closestIdeology(result);assert.equal(c.id,'centrist');assert.equal(c.gap,0);
  assert.match(c.caveats.join(''),/不稳定/);
});
