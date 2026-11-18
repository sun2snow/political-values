// Exploratory, offline only. Does not affect scoring, ranking, or the live questionnaire.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {parseAnswers,score} from '../../core.mjs';
import {IDEOLOGIES,ideologyPresentation,rankedIdeologies} from '../../ideology.mjs';

import {CLASSIFIER_VERSION as historicalVersion,IDEOLOGIES as historicalCatalog,preliminaryIdeology as historicalFirst} from './archive/nearest-tradition-2.2/ideology.mjs';

const load=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const [primary,recovery,bank]=await Promise.all([load('./results/results.json'),load('./recovery/results.json'),load('../../legacy/v2.1/data.json')]);
assert.equal(primary.version,bank.version,'离线回放必须使用原版题库');
const runs={...primary.runs,...recovery.runs};
const focus=[
  {id:'participatory-democracy',dimensions:['D3','D4','D5'],reason:'个人权利、权力监督和公众参与是该参考画像直接描述的治理主张。'},
  {id:'market-socialist',dimensions:['D1','D2','D5'],reason:'分配、市场配置与参与是可用的代理维度；公众参与不等同于劳动者掌握企业所有权。'},
  {id:'centrist',dimensions:[],reason:'不人为指定核心维度；保留等权对照，观察正式规则是否触发澄清。'},
];
function replay(id){
  const run=runs[id];assert.ok(run?.actual&&run.answers,`缺少有效答卷：${id}`);
  const result=score(parseAnswers(JSON.stringify(run.answers),bank),bank);
  assert.deepEqual(result.dimensions.map(d=>d.score),run.scores);
  return result;
}
function weightedRanking(result,ids,multiplier){
  const weights=result.dimensions.map(d=>ids.includes(d.id)?multiplier:1);
  const total=weights.reduce((s,w)=>s+w,0);
  return IDEOLOGIES.map(p=>({id:p.id,name:p.name,distance:Math.sqrt(result.dimensions.reduce((s,d,i)=>s+weights[i]*(Math.round(d.score*100)-100*p.point[i])**2,0)/total)/100}))
    .sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id,'en'));
}
// The frozen module exposes the winner, not the other 23 ranks. Reproduce its
// floating-point RMSE on the frozen catalog; verify against archived outputs.
const view={},changes=[];
let firstChanges=0,top3Changes=0;
for(const {id,name} of IDEOLOGIES){
  const result=replay(id),run=runs[id],display=ideologyPresentation(result);
  assert.equal(run.actual.version,historicalVersion);
  view[display.kind]=(view[display.kind]??0)+1;
  const old=historicalCatalog.map(p=>({id:p.id,name:p.name,distance:Math.sqrt(run.scores.reduce((s,v,i)=>s+(v-p.point[i])**2,0)/10)}))
    .sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id,'en'));
  assert.equal(old[0].id,historicalFirst(result).id);assert.deepEqual(old.slice(0,3),run.top3);
  assert.equal(old.findIndex(p=>p.id===id)+1,run.targetRank);
  const now=rankedIdeologies(result);assert.equal(now.length,old.length);
  const moved=old.flatMap((p,i)=>p.id===now[i].id?[]:[{rank:i+1,from:p.name,to:now[i].name}]);
  if(moved.length){changes.push({name,moved});if(moved[0].rank===1)firstChanges++;if(moved[0].rank<=3)top3Changes++;}
}
const report=['# 候选展示回放与关键维度敏感性检查','','## 用原答卷回放新展示规则','',
  `24 份合成答卷中，${view.close??0} 份改为并列对照，${view.distant??0} 份显示没有足够接近的参考画像，${view.matched??0} 份仍展示一个参考名称，${view.undetermined??0} 份维持未确定，${view.mixed??0} 份维持混合立场，${view.insufficient??0} 份信息不足。十维分数逐份与历史记录一致。`,
  '',`对比 ${historicalVersion} 的浮点距离与当前的整数平方距离排序：${changes.length} 份答卷的候选名次有变化，${firstChanges} 份改变第一名，${top3Changes} 份改变前三顺序。以下列出所有换位（原候选 → 当前候选）。`,
  ...changes.map(({name,moved})=>`- ${name}角色：${moved.map(m=>`第 ${m.rank} 名 ${m.from} → ${m.to}`).join('；')}。`),
  '', '## 对三个案例改变维度权重', '',
  '每行先选出该案例要观察的维度，再用同一组权重比较该案例与所有候选。其余维度权重为 1。这里的权重取值只是敏感性检查，不是给画像校准后的权重。', '',
  '| 目标画像 | 关键维度 | 等权：排名／最近坐标 | 2 倍：排名／最近坐标 | 4 倍：排名／最近坐标 |',
  '|---|---|---|---|---|'];
const summaries=[];
for(const {id,dimensions,reason} of focus){
  const result=replay(id),name=IDEOLOGIES.find(p=>p.id===id).name;
  const ranks=[1,2,4].map(multiplier=>weightedRanking(result,dimensions,multiplier));
  assert.deepEqual(ranks[0].map(p=>p.id),rankedIdeologies(result).map(p=>p.id));
  const cells=ranks.map(r=>`${r.findIndex(p=>p.id===id)+1}／${r[0].name}`);
  report.push(`| ${name} | ${dimensions.join('、')||'不调整'} | ${cells.join(' | ')} |`);
  summaries.push(`- ${name}：${reason} 原测试${runs[id].clarificationCount?'已':'未'}触发澄清题。`);
}
report.push('',...summaries,'','关键维度是在看到初测问题后选的，三个案例各只有一份答卷。即使排名提高，也不能证明加权更准确。需要用其他模型、提示词和真人答卷独立验证；本实验不调用模型、不接入线上规则。','');
const text=report.join('\n');
const path=new URL('./results/敏感性检查.md',import.meta.url);
if(process.argv.includes('--check'))assert.equal(await readFile(path,'utf8'),text,'敏感性报告需要重新生成');
else await writeFile(path,text);
console.log(text);
