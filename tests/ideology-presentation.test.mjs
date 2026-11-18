import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {score,markdownReport} from '../core.mjs';
import {closestIdeology,ideologyPresentation,rankedIdeologies} from '../ideology.mjs';
import {questionnairePages} from '../flow.mjs';

const bank=JSON.parse(readFileSync(new URL('../data.json',import.meta.url),'utf8'));
const answersAt=point=>Object.fromEntries(bank.items.filter(q=>q.status==='core').map(q=>[q.id,3+q.direction*(point[Number(q.dimension.slice(1))-1]-50)/25]));
const tie=[0,25,75,75,50,75,75,75,50,50];

test('exact tie stays deterministic for the rule but is presented as an unranked comparison',()=>{
  const answers=answersAt(tie),result=score(answers,bank),display=ideologyPresentation(result);
  assert.equal(display.kind,'close');
  assert.equal(display.conclusion.gap,0);
  assert.deepEqual(display.conclusion,closestIdeology(result));
  assert.deepEqual(display.candidates.map(p=>p.id),['libertarian','social-liberal','classical-liberal']);
  assert.ok(display.candidates.every(p=>p.distance-display.conclusion.distance<3));
  assert.equal(display.differences.length,3);
  assert.ok(display.differences.every(d=>d.points.length===display.candidates.length));
  assert.ok(display.differences[0].spread>=display.differences[1].spread);
  const md=markdownReport(result);
  assert.match(md,/\*\*多个参考画像接近，暂不归为单一标签\*\*/);
  assert.match(md,/\| 维度 \| 你的分数 \| 自由意志主义 \| 社会自由主义 \| 古典自由主义 \|/);
  assert.doesNotMatch(md,/\*\*自由意志主义（参考性总结）\*\*/);
  assert.equal(questionnairePages(answers,bank).length,12);
});

test('large distance takes priority over a displayable candidate and does not change scores',()=>{
  const result=score(answersAt([0,100,0,100,0,100,0,100,0,100]),bank);
  const before=JSON.stringify(result),display=ideologyPresentation(result);
  assert.equal(display.kind,'distant');
  assert.ok(display.conclusion.distance>=25);
  assert.equal(display.candidates.length,3);
  assert.match(markdownReport(result),/没有足够接近的参考画像/);
  assert.equal(JSON.stringify(result),before);
});

test('missing scores and clarification decisions retain priority over any close reference',()=>{
  const incomplete=score({},bank);
  assert.equal(ideologyPresentation(incomplete).kind,'insufficient');
  assert.deepEqual(rankedIdeologies(incomplete),[]);
  const answers=answersAt(Array(10).fill(50));
  const before=score(answers,bank);
  assert.equal(ideologyPresentation(before).kind,'undetermined');
  assert.match(markdownReport(before),/暂不能确定最贴近的意识形态/);
  for(const i of [1,2,3,4])answers[`C_D${i}`]='conditional';
  assert.equal(ideologyPresentation(score(answers,bank)).kind,'mixed');
  for(let i=1;i<=10;i++)answers[`C_D${i}`]='compromise';
  assert.equal(ideologyPresentation(score(answers,bank)).kind,'matched');
});

test('display and classifier use the same ranked distances even when result dimensions are out of order',()=>{
  const result=score(answersAt(tie),bank);
  const reversed={...result,dimensions:[...result.dimensions].reverse()};
  assert.deepEqual(ideologyPresentation(reversed),ideologyPresentation(result));
});
