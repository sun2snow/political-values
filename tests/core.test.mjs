import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {score,parseAnswers,validateAnswers,exportAnswers,markdownReport} from '../core.mjs';
import {adaptivePlan,activeQuestionIds,createPages} from '../adaptive.mjs';
import {closestIdeology,IDEOLOGIES} from '../ideology.mjs';
const bank=JSON.parse(readFileSync(new URL('../data.json',import.meta.url),'utf8'));
const base=bank.items.filter(i=>i.status==='core');
const uniform=z=>Object.fromEntries(base.map(i=>[i.id,3+z*i.direction]));
function scattered(dimension='D1',values=[-2,2,-2,2,-2,2,-2,2]){
  return Object.fromEntries(base.filter(i=>i.dimension===dimension).slice(0,values.length).map((i,k)=>[i.id,3+values[k]*i.direction]));
}
test('v2 inventory is 80 base plus 40 balanced supplemental and 16 nonscoring items',()=>{
  assert.equal(base.length,80);assert.equal(bank.items.length,120);assert.equal(bank.administration_order.length,96);
  assert.equal(new Set(bank.administration_order).size,96);
  for(const d of bank.dimensions){const extra=bank.items.filter(i=>i.dimension===d.id&&i.status==='supplemental');assert.equal(extra.length,4);assert.equal(extra.reduce((s,i)=>s+i.direction,0),0);}
});
test('uniform positions and neutral answers do not trigger extras; reverse keys are applied',()=>{
  for(const z of [-2,-1,0,1,2]){
    const ans=uniform(z);assert.equal(adaptivePlan(ans,bank).length,0);
    for(const d of score(ans,bank).dimensions)assert.equal(d.score,25*(z+2));
  }
  const allAgree=Object.fromEntries(base.map(i=>[i.id,5]));
  assert.equal(adaptivePlan(allAgree,bank).length,10);
  assert.equal(activeQuestionIds(allAgree,bank).length,136);
});
test('a scattered dimension gets exactly its four extra questions and no others',()=>{
  const ans={...uniform(0),...scattered()};const plan=adaptivePlan(ans,bank);
  assert.equal(plan.length,1);assert.equal(plan[0].variance,4);
  assert.deepEqual(plan[0].ids,['D1_09','D1_10','D1_11','D1_12']);
  assert.equal(createPages(ans,bank).length,13);assert.equal(activeQuestionIds(ans,bank).length,100);
});
test('minimum effective count, both-direction guard and variance threshold',()=>{
  assert.equal(adaptivePlan(scattered('D1',[-2,2,-2,2,-2]),bank).length,0);
  assert.equal(adaptivePlan(scattered('D1',[-2,2,-2,2,-2,2]),bank).length,1);
  assert.equal(adaptivePlan(scattered('D1',[-1,1,-1,1,-1,1,-1,1]),bank).length,0);
  assert.equal(adaptivePlan(scattered('D1',[-2,2,-1,1,-1,1,-1,1]),bank).length,1);
  assert.equal(adaptivePlan(scattered('D1',[-2,2,2,2,2,2,2,2]),bank).length,0);
  // Exactly variance 1.5 after direction normalization.
  assert.equal(adaptivePlan(scattered('D1',[-2,2,-1,1,-1,1,0,0]),bank).length,1);
});
test('U Q and skips do not become neutral answers or trigger follow-ups with insufficient data',()=>{
  const ans={...scattered('D1',[-2,2,-2,2,-2]),D1_06:'U',D1_07:'Q',D1_08:null};
  assert.equal(adaptivePlan(ans,bank).length,0);
  const d=score(ans,bank).dimensions[0];assert.equal(d.score,null);assert.equal(d.counts.unknown,1);assert.equal(d.counts.unclear,1);assert.equal(d.counts.neutral,0);
});
test('supplemental scores are equal-weight, bounded and retain the baseline score',()=>{
  const ans={...uniform(0),...scattered()};
  const before=score(ans,bank).dimensions[0];assert.equal(before.base_score,50);assert.equal(before.score,50);assert.equal(before.total_items,12);
  Object.assign(ans,{D1_09:5,D1_10:1,D1_11:5,D1_12:1});
  const result=score(ans,bank),d=result.dimensions[0];
  assert.equal(d.base_score,50);assert.equal(d.score,66.67);assert.equal(d.answered,12);assert.equal(d.supplemental_answered,4);
  assert.equal(result.scored_answers,80);assert.equal(result.supplemental_answers,4);
  assert.match(markdownReport(result),/基础分50/);assert.match(markdownReport(result),/12\/12/);
});
test('editing the baseline deactivates extras without deleting answers, and reactivates deterministically',()=>{
  const ans={...uniform(0),...scattered(),D1_09:5,D1_10:1,D1_11:5,D1_12:1};
  assert.equal(score(ans,bank).supplemental_answers,4);
  Object.assign(ans,Object.fromEntries(base.filter(i=>i.dimension==='D1').map(i=>[i.id,3])));
  const result=score(ans,bank);assert.equal(result.supplemental_offered,0);assert.equal(result.dimensions[0].score,50);assert.equal(activeQuestionIds(ans,bank).length,96);
  assert.equal(ans.D1_09,5);
  Object.assign(ans,scattered());assert.equal(score(ans,bank).supplemental_answers,4);
});
test('follow-up answers cannot create more follow-ups or rescue missing baseline data',()=>{
  const ans=uniform(0);Object.assign(ans,{D1_09:5,D1_10:5,D1_11:1,D1_12:1});
  assert.equal(adaptivePlan(ans,bank).length,0);assert.equal(score(ans,bank).dimensions[0].score,50);
  const onlyExtra={D1_09:5,D1_10:1,D1_11:5,D1_12:1};assert.equal(score(onlyExtra,bank).dimensions[0].score,null);
});
test('skipped extras remain optional and do not change the average',()=>{
  const ans={...uniform(0),...scattered(),D1_09:'U',D1_10:'Q',D1_11:null};const r=score(ans,bank);
  assert.equal(r.dimensions[0].score,50);assert.equal(r.supplemental_answers,0);assert.equal(r.supplemental_offered,4);
  assert.equal(closestIdeology(r).status,'matched');assert.match(closestIdeology(r).caveats.join(''),/0\/4/);
});
test('versioned export/import preserves all answers including inactive extras; v1 is rejected',()=>{
  const ans={...uniform(1),D1_09:3,S01:'C',F01:2};
  assert.deepEqual(parseAnswers(JSON.stringify(exportAnswers(ans,bank)),bank),ans);
  assert.throws(()=>parseAnswers(JSON.stringify(ans),bank),/旧版/);
  assert.throws(()=>parseAnswers(JSON.stringify({...exportAnswers(ans,bank),version:'1.0.0-exploratory'}),bank),/旧版/);
  assert.throws(()=>parseAnswers('{"format":"political-values-answers","version":"2.0.0-exploratory","answers":{"D1_01":3,"D1_01":5}}',bank),/重复/);
});
test('invalid values and unknown question IDs are rejected',()=>{
  for(const ans of [[],null,{D1_01:true},{D1_09:6},{D1_13:3},{S01:3},{F01:'U'},{D1_01:'3'}])assert.throws(()=>validateAnswers(ans,bank));
});
test('scenario and feedback answers do not change scores or follow-up selection',()=>{
  const ans={...uniform(1),...scattered()};const before=score(ans,bank);
  Object.assign(ans,{S01:'A',S02:'B',F01:5,F02:1});const after=score(ans,bank);
  assert.deepEqual(before.dimensions,after.dimensions);assert.deepEqual(before.adaptive,after.adaptive);
});
test('reference centroids retain their closest ideology with simplified questions',()=>{
  for(const p of IDEOLOGIES){const ans=Object.fromEntries(base.map(i=>[i.id,3+(p.point[Number(i.dimension.slice(1))-1]-50)/25*i.direction]));assert.equal(closestIdeology(score(ans,bank)).id,p.id);}
});
test('HTML methods and questionnaire are rendered; UI does not link to raw Markdown',()=>{
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');assert.doesNotMatch(app,/href="[^"]+\.md"/);
  const html=readFileSync(new URL('../docs/最贴近意识形态规则.html',import.meta.url),'utf8');assert.match(html,/<table>/);assert.match(html,/<h1>/);assert.match(html,/viewport/);
  const question=readFileSync(new URL('../docs/问卷.html',import.meta.url),'utf8');
  for(const q of bank.items)assert.ok(question.includes(q.text),q.id);
  assert.ok(existsSync(new URL('../legacy/v1/index.html',import.meta.url)));
  assert.doesNotMatch(question,/C不是默认最佳答案/);
});
