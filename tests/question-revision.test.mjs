import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clarificationsFor} from '../clarification.mjs';
import {exportAnswers,parseAnswers,score} from '../core.mjs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const bank=JSON.parse(read('../data.json'));
const old=JSON.parse(read('../legacy/v2.1/data.json'));
const changedDims=new Set(['D2','D5','D6','D9']);
const items=new Map(bank.items.map(q=>[q.id,q]));

test('v2.2 revises 33 items in four dimensions and preserves IDs, direction and order',()=>{
  assert.equal(bank.version,'2.2.0-exploratory');
  assert.deepEqual(bank.administration_order,old.administration_order);
  assert.deepEqual(bank.scenarios,old.scenarios);
  assert.deepEqual(bank.feedback,old.feedback);
  assert.deepEqual(bank.adaptive,old.adaptive);
  const changed=old.items.filter(q=>q.text!==items.get(q.id).text);
  assert.equal(changed.length,33);
  assert.deepEqual(new Set(changed.map(q=>q.dimension)),changedDims);
  for(const [i,q] of old.items.entries()){
    const newer=bank.items[i];
    for(const prop of ['id','status','dimension','direction'])assert.equal(newer[prop],q[prop],q.id);
    if(!changedDims.has(q.dimension))assert.deepEqual(newer,q,q.id);
  }
  for(const [id,wording] of Object.entries({D2_05:'增产任务',D5_05:'最终应由市民投票',D6_06:'要求参加公共环节的人统一穿传统服装'})){
    assert.ok(items.get(id).text.includes(wording),id);
  }
});

test('each D9 pair has the same scenario with the two priorities reversed',()=>{
  const d9=bank.items.filter(q=>q.dimension==='D9');
  assert.equal(d9.length,12);
  for(let i=0;i<d9.length;i+=2){
    const [a,b]=d9.slice(i,i+2),stem=' 在这两种做法中，应该先';
    const [first,u]=a.text.split(stem),[second,v]=b.text.split(stem);
    assert.equal(first,second);
    const priorities=tail=>tail.slice(0,-1).split('，再考虑');
    assert.equal(priorities(u).length,2);
    assert.deepEqual(priorities(u),priorities(v).reverse());
    assert.equal(a.direction,1);assert.equal(b.direction,-1);
  }
});

test('revised clarification endpoints agree with the bank and published documentation',()=>{
  const docs=read('../docs/澄清题.md');
  for(const q of clarificationsFor(bank)){
    const id=q.id.slice(2);
    if(!changedDims.has(id)){
      assert.deepEqual(q,clarificationsFor(old).find(x=>x.id===q.id));continue;
    }
    const {name,low,high}=bank.dimensions.find(d=>d.id===id);
    assert.equal(q.help,`前一种：${low}。后一种：${high}。`);
    assert.ok(docs.includes(`| ${q.id} | ${name} | ${low} | ${high} |`));
  }
});

test('old exports are still scoreable with their frozen bank but not with the rewritten items',()=>{
  const answers={D2_05:5,D5_05:4,C_D9:'conditional'};
  const text=JSON.stringify(exportAnswers(answers,old));
  assert.deepEqual(parseAnswers(text,old),answers);
  assert.equal(score(parseAnswers(text,old),old).version,old.version);
  assert.throws(()=>parseAnswers(text,bank),/版本不符/);
});
