import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {score,parseAnswers,validateAnswers,exportAnswers,markdownReport} from '../core.mjs';
import {adaptivePlan,activeQuestionIds,createPages} from '../adaptive.mjs';
import {closestIdeology,IDEOLOGIES} from '../ideology.mjs';
const bank=JSON.parse(readFileSync(new URL('../data.json',import.meta.url),'utf8'));
const archivedBank=JSON.parse(readFileSync(new URL('../legacy/v2.1/data.json',import.meta.url),'utf8'));
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
  assert.equal(closestIdeology(r).status,'undetermined');assert.match(closestIdeology(r).caveats.join(''),/0\/4/);
});
test('versioned export/import preserves all answers including inactive extras; v1 is rejected',()=>{
  const ans={...uniform(1),D1_09:3,S01:'C',F01:2};
  assert.deepEqual(parseAnswers(JSON.stringify(exportAnswers(ans,bank)),bank),ans);
  assert.throws(()=>parseAnswers(JSON.stringify(ans),bank),/旧版/);
  assert.throws(()=>parseAnswers(JSON.stringify({...exportAnswers(ans,bank),version:'1.0.0-exploratory'}),bank),/旧版/);
  assert.throws(()=>parseAnswers('{"format":"political-values-answers","version":"2.2.0-exploratory","answers":{"D1_01":3,"D1_01":5}}',bank),/重复/);
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
  for(const p of IDEOLOGIES){const ans=Object.fromEntries(base.map(i=>[i.id,3+(p.point[Number(i.dimension.slice(1))-1]-50)/25*i.direction]));if(p.id==='centrist')for(let n=1;n<=10;n++)ans[`C_D${n}`]='compromise';assert.equal(closestIdeology(score(ans,bank)).id,p.id);}
});
test('HTML methods and questionnaire are rendered; UI does not link to raw Markdown',()=>{
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');assert.doesNotMatch(app,/href="[^"]+\.md"/);
  const html=readFileSync(new URL('../docs/最贴近意识形态规则.html',import.meta.url),'utf8');assert.match(html,/<table>/);assert.match(html,/<h1>/);assert.match(html,/viewport/);
  const question=readFileSync(new URL('../docs/问卷.html',import.meta.url),'utf8');
  for(const q of bank.items)assert.ok(question.includes(q.text),q.id);
  assert.ok(existsSync(new URL('../legacy/v1/index.html',import.meta.url)));
  assert.doesNotMatch(question,/C不是默认最佳答案/);
});

test('exact squared-distance tie follows ID order and triggers clarification in real quiz flow',async()=>{
  const {rankedIdeologies,preliminaryIdeology}=await import('../ideology.mjs');
  const {questionnairePages}=await import('../flow.mjs');
  const sums=[5,-2,-4,7,-4,-3,-5,-3,-4,6];
  const answers=Object.fromEntries(base.map(q=>{
    const sum=sums[Number(q.dimension.slice(1))-1],n=Number(q.id.split('_')[1]);
    return [q.id,3+(n<=Math.abs(sum)?Math.sign(sum):0)*q.direction];
  }));
  const r=score(answers,bank),[a,b]=rankedIdeologies(r);
  assert.deepEqual([a.id,b.id],['centrist','communitarian-conservative']);assert.equal(a.distance,b.distance);
  assert.equal(preliminaryIdeology(r).gap,0);assert.equal(closestIdeology(r).status,'undetermined');
  assert.equal(questionnairePages(answers,bank).filter(p=>p.type==='clarification').flatMap(p=>p.ids).length,10);
});

test('centrist clarification separates identical averages without changing political scores',()=>{
  const neutral=uniform(0), mixed=Object.fromEntries(base.map(i=>[i.id,5]));
  const clarity=Object.fromEntries(Array.from({length:10},(_,i)=>[`C_D${i+1}`,'compromise']));
  assert.deepEqual(score(neutral,bank).dimensions.map(d=>d.score),score(mixed,bank).dimensions.map(d=>d.score));
  assert.equal(closestIdeology(score(neutral,bank)).status,'undetermined');
  assert.equal(closestIdeology(score({...neutral,...clarity},bank)).id,'centrist');
  assert.equal(closestIdeology(score({...mixed,...clarity},bank)).status,'mixed');
  assert.deepEqual(score(neutral,bank).dimensions,score({...neutral,...clarity},bank).dimensions);
  assert.match(markdownReport(score({...mixed,...clarity},bank)),/混合立场，暂不归为单一意识形态/);
  assert.match(markdownReport(score(neutral,bank)),/暂不能确定最贴近的意识形态/);
});
test('clarification threshold boundaries and uncertainty do not become compromise',()=>{
  const neutral=score(uniform(0),bank);
  const make=values=>({...neutral,clarifications:Object.fromEntries(values.map((v,i)=>[`C_D${i+1}`,v]))});
  const c=(values)=>closestIdeology(make(values));
  assert.equal(c([...Array(6).fill('compromise'),'first','second']).id,'centrist');
  assert.equal(c([...Array(6).fill('compromise'),'first']).status,'undetermined');
  assert.equal(c([...Array(5).fill('compromise'),'first','unsure','unrepresented']).status,'undetermined');
  assert.equal(c([...Array(6).fill('compromise'),...Array(3).fill('first')]).status,'undetermined');
  assert.equal(c(Array(3).fill('conditional')).status,'undetermined');
  assert.equal(c(Array(4).fill('conditional')).status,'mixed');
  for(const value of ['unsure','unrepresented'])assert.equal(c(Array(10).fill(value)).status,'undetermined');
  const exact=make(Array(10).fill('compromise'));
  exact.dimensions=exact.dimensions.map((d,i)=>({...d,score:i<4?35:i<8?65:50}));
  assert.equal(closestIdeology(exact).id,'centrist');
  exact.dimensions[0].score=34.99;exact.dimensions[1].score=34.99;
  assert.equal(closestIdeology(exact).id,'centrist'); // Eight inside the inclusive band.
  exact.dimensions[2].score=34.99;assert.equal(closestIdeology(exact).status,'undetermined');
  const both=make(Array(10).fill('compromise'));
  both.dimensions=both.dimensions.map((d,i)=>({...d,counts:{...d.counts,left:i<2?2:0,right:i<2?2:0}}));
  assert.equal(closestIdeology(both).id,'centrist');
  both.dimensions[2].counts={...both.dimensions[2].counts,left:2,right:2};
  assert.equal(closestIdeology(both).status,'mixed');
});
test('version 2 import and separate clarification export roundtrip',()=>{
  const answers={...uniform(0),C_D1:'compromise',C_D2:'conditional',C_D3:null};
  const envelope=exportAnswers(answers,bank);
  assert.equal(envelope.version,'2.2.0-exploratory');assert.equal(envelope.answers.C_D1,undefined);
  assert.deepEqual(envelope.clarifications,{C_D1:'compromise',C_D2:'conditional',C_D3:null});
  assert.deepEqual(parseAnswers(JSON.stringify(envelope),bank),answers);
  const oldText=JSON.stringify({format:envelope.format,version:'2.0.0-exploratory',answers:uniform(0)});
  assert.throws(()=>parseAnswers(oldText,bank),/版本不符/);
  assert.throws(()=>parseAnswers(JSON.stringify({...envelope,version:archivedBank.version}),bank),/版本不符/);
  assert.throws(()=>parseAnswers(JSON.stringify(envelope),archivedBank),/版本不符/);
  for(const value of [3,'U','Q',true,{},['compromise'],'__proto__'])assert.throws(()=>validateAnswers({C_D1:value},bank));
  assert.throws(()=>validateAnswers({C_D11:'compromise'},bank));
  for(const clarifications of [[],false,{D1_01:3},{C_D11:'compromise'}])assert.throws(()=>parseAnswers(JSON.stringify({...envelope,clarifications}),bank));
});
test('clarification pages are conditional and inactive answers survive reactivation',async()=>{
  const {questionnairePages}=await import('../flow.mjs');
  const answers={...uniform(0),C_D1:'compromise'};
  assert.equal(questionnairePages(answers,bank).filter(p=>p.type==='clarification').flatMap(p=>p.ids).length,10);
  const other=IDEOLOGIES.find(p=>p.id==='classical-liberal');
  const directional=Object.fromEntries(base.map(i=>[i.id,3+(other.point[Number(i.dimension.slice(1))-1]-50)/25*i.direction]));
  Object.assign(answers,directional);
  assert.equal(questionnairePages(answers,bank).filter(p=>p.type==='clarification').length,0);
  assert.equal(closestIdeology(score(answers,bank)).id,'classical-liberal');
  assert.equal(closestIdeology(score(answers,bank)).clarificationRequired,false);
  assert.equal(exportAnswers(answers,bank).clarifications.C_D1,'compromise');
  Object.assign(answers,uniform(0));assert.equal(questionnairePages(answers,bank).length,14);
  assert.equal(closestIdeology(score(answers,bank)).clarification.counts.compromise,1);
});

test('expanded catalog has distinct, complete profiles and synchronized readable docs',()=>{
  assert.equal(IDEOLOGIES.length,24);
  assert.equal(new Set(IDEOLOGIES.map(p=>p.id)).size,24);
  assert.equal(new Set(IDEOLOGIES.map(p=>p.name)).size,24);
  assert.equal(new Set(IDEOLOGIES.map(p=>JSON.stringify(p.point))).size,24);
  const doc=readFileSync(new URL('../docs/最贴近意识形态规则.html',import.meta.url),'utf8');
  for(const p of IDEOLOGIES){
    assert.equal(p.point.length,10);assert.ok(p.point.every(v=>Number.isFinite(v)&&v>=0&&v<=100));
    assert.ok(p.family&&p.description&&p.limitation);
    for(const text of [p.name,p.description,p.limitation])assert.ok(doc.includes(text),text);
    const answers=Object.fromEntries(base.map(i=>[i.id,3+(p.point[Number(i.dimension.slice(1))-1]-50)/25*i.direction]));
    for(let n=1;n<=10;n++)answers[`C_D${n}`]='compromise';
    const r=score(answers,bank),c=closestIdeology(r);
    assert.equal(c.id,p.id);assert.equal(c.limitation,p.limitation);assert.equal(c.version,'nearest-tradition-2.3');
    assert.ok(markdownReport(r).includes(p.limitation));assert.match(c.caveats.join(''),/24种/);
  }
  assert.doesNotMatch(doc,/12种预设|下表12种|下面12种/);
});
test('catalog expansion preserves original reference coordinates and distances',async()=>{
  const {IDEOLOGIES:original}=await import('../legacy/v1/ideology.mjs');
  for(const p of original){assert.deepEqual(IDEOLOGIES.find(x=>x.id===p.id).point,p.point);}
  const centroid=IDEOLOGIES.find(p=>p.id==='eco-socialist');
  const answers=Object.fromEntries(base.map(i=>[i.id,3+(centroid.point[Number(i.dimension.slice(1))-1]-50)/25*i.direction]));
  const before=score(answers,bank),c=closestIdeology(before);assert.equal(c.id,'eco-socialist');assert.equal(c.distance,0);
  // Concrete neighboring answer: one moderately changed item still matches the new profile.
  answers.D1_01=4;assert.equal(closestIdeology(score(answers,bank)).id,'eco-socialist');
});

test('UI modules avoid raw Markdown links, inline style attributes, and stay synced with zip bundle',()=>{
  const uiFiles=['../index.html','../app.js',...readdirSync(new URL('../ui/',import.meta.url)).filter(f=>f.endsWith('.mjs')).map(f=>`../ui/${f}`)];
  for(const rel of uiFiles){
    const text=readFileSync(new URL(rel,import.meta.url),'utf8');
    assert.doesNotMatch(text,/href="[^"]+\.md"/,rel);
    assert.doesNotMatch(text,/\sstyle="/,rel);
  }
  const zip=readFileSync(new URL('../questionnaire-v2.zip',import.meta.url));
  const entries=new Map();
  for(let i=zip.length-22;i>=0;i--){
    if(zip.readUInt32LE(i)===0x06054b50){
      let off=zip.readUInt32LE(i+16), count=zip.readUInt16LE(i+10);
      for(let n=0;n<count;n++){
        assert.equal(zip.readUInt32LE(off),0x02014b50);
        const method=zip.readUInt16LE(off+10), csize=zip.readUInt32LE(off+20);
        const nlen=zip.readUInt16LE(off+28), elen=zip.readUInt16LE(off+30), clen=zip.readUInt16LE(off+32);
        const lhoff=zip.readUInt32LE(off+42);
        const name=zip.subarray(off+46,off+46+nlen).toString('utf8');
        const ln=zip.readUInt16LE(lhoff+26), le=zip.readUInt16LE(lhoff+28);
        const raw=zip.subarray(lhoff+30+ln+le,lhoff+30+ln+le+csize);
        entries.set(name,method===8?inflateRawSync(raw):raw);
        off+=46+nlen+elen+clen;
      }
      break;
    }
  }
  for(const file of ['styles.css','data.json','core.mjs','adaptive.mjs','ideology.mjs','ideology-profiles.mjs','clarification.mjs','flow.mjs']){
    assert.deepEqual(entries.get(file),readFileSync(new URL(`../${file}`,import.meta.url)),`${file} in questionnaire-v2.zip`);
  }
});
