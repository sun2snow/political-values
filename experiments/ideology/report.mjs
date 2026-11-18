import {readFile,writeFile} from 'node:fs/promises';
import {join,relative} from 'node:path';
import assert from 'node:assert/strict';
import {parseAnswers,score} from '../../core.mjs';
import {CLASSIFIER_VERSION,ideologyPresentation,closestIdeology,IDEOLOGIES} from '../../ideology.mjs';
import {closestIdeology as historicalClosest} from './archive/nearest-tradition-2.2/ideology.mjs';

const dir=process.argv[2],recoveryDir=process.argv[3];
if(!dir)throw new Error('用法：node experiments/ideology/report.mjs <结果目录> [补测目录]');
const raw=JSON.parse(await readFile(join(dir,'results.json'),'utf8'));
const protocol=JSON.parse(await readFile(join(dir,'protocol.json'),'utf8'));
const disclosed=Object.entries(protocol.personas).filter(([, [brief]])=>IDEOLOGIES.some(p=>brief.includes(p.name))).map(([id])=>id);
const recovery=recoveryDir?JSON.parse(await readFile(join(recoveryDir,'results.json'),'utf8')):null;
const readCalls=async folder=>(await readFile(join(folder,'calls.jsonl'),'utf8')).split('\n').filter(Boolean).map(JSON.parse);
const callLog=await readCalls(dir);
// A follow-up with no failed targets makes no requests and creates no log.
const followUpCalls=recovery&&(Object.keys(recovery.runs).length||Object.keys(recovery.baselines).length)?await readCalls(recoveryDir):[];
const okCount=calls=>calls.filter(c=>c.ok).length;
const bankPath=raw.version==='2.1.0-exploratory'?'../../legacy/v2.1/data.json':'../../data.json';
const bank=JSON.parse(await readFile(new URL(bankPath,import.meta.url),'utf8'));
if(bank.version!==raw.version)throw new Error('题库与答卷的版本不符');
const profiles=new Map(IDEOLOGIES.map(p=>[p.id,p.name]));
const name=id=>profiles.get(id)??'—';
const num=n=>n==null?'—':n.toFixed(2);
const rate=(n,d)=>d?`${(n/d*100).toFixed(1)}%`:'—';
const roles=IDEOLOGIES.map(p=>[p,raw.runs[p.id]]);
const complete=roles.filter(([,r])=>r.actual);
const hit=(p,r)=>r.actual?.status==='matched'&&r.actual.id===p.id;
const exact=complete.filter(([p,r])=>hit(p,r));
const top3=complete.filter(([,r])=>r.targetRank&&r.targetRank<=3);
const top1=complete.filter(([p,r])=>r.preliminary===p.id);
const mismatches=complete.filter(([p,r])=>!hit(p,r));
const baselines=raw.candidates.map(m=>raw.baselines[m].full).filter(Boolean);
const aligned=complete.map(([,r])=>r.pilotFit?.agreement-r.baselineFit?.agreement).filter(Number.isFinite);
const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:NaN;
const pilotTotal=roles.length*raw.candidates.length;
const pilotSuccess=Object.values(raw.pilot).flatMap(Object.values).filter(v=>v.fit).length;
function pilotWinners(id){
  const fits=Object.entries(raw.pilot[id]).filter(([,v])=>v.fit);
  const best=Math.min(...fits.map(([,v])=>v.fit.mae));
  return fits.filter(([,v])=>v.fit.mae===best).map(([model])=>model);
}
const tied=roles.filter(([p])=>pilotWinners(p.id).length>1).length;
const reasons={matched:'已匹配',insufficient:'信息不足',mixed:'混合立场',undetermined:'未确定'};
const actualName=r=>r.actual?.status==='matched'?r.actual.name:reasons[r.actual?.status]??'没有有效结果';
const repeats=recovery?[...Object.values(recovery.runs),...Object.values(recovery.baselines)]:[];
const recovered=roles.flatMap(([p,r])=>!r.actual&&recovery?.runs[p.id]?.actual?[[p,recovery.runs[p.id]]]:[]);
const views=new Map();
const userView=r=>views.get(r)??'—';
for(const r of [...complete.map(([,r])=>r),...baselines.filter(r=>r.actual),...repeats.filter(r=>r.actual)]){
  const decoded=parseAnswers(JSON.stringify(r.answers),bank);
  const result=score(decoded,bank);
  assert.deepEqual(result.dimensions.map(d=>d.score),r.scores);
  assert.deepEqual(r.actual.version==='nearest-tradition-2.2'?historicalClosest(result):closestIdeology(result),r.actual);
  const view=ideologyPresentation(result);
  views.set(r,view.kind==='matched'?`单一：${view.conclusion.name}`:view.kind==='close'?`多候选：${view.candidates.map(p=>p.name).join('／')}${view.additional.length?'等':''}`:view.heading??actualName({actual:view.conclusion}));
}
const lines=['# 24 种参考画像的模型模拟测试','',
`- 开始：${raw.started}；结束：${raw.finished}。问卷版本：\`${raw.version}\`。`,
`- 候选：${raw.candidates.map(m=>'`'+m+'`').join('、')}，均通过 CLIProxyAPI 实际响应探测；未调用 Claude。候选是三个模型家族中可用的文本模型样本，不是 API 所有模型的穷举。`,
`- 各模型、角色和题批使用无历史请求，不共享工具、文件或之前的结果。没有发送探针答案、参考坐标或计分键。${disclosed.length?'原始提示中有 '+disclosed.length+' 个直接出现参考名称（'+disclosed.map(name).join('、')+'），不能称为完全盲测。':'角色提示没有直接出现参考画像名称，但定性主张仍可能暗示类别。'}`,
'- 角色综合常见政治思想概述与项目里的限定定义。几种“取向”是项目中的描述性组合，没有公认的唯一标准；本测试不代表整个思想传统。',
'- 先让候选回答 15 道独立探针。每种角色只对事先指定的关键探针评分：平均绝对误差（MAE）最低的模型入选；精确并列时依候选顺序处理。正式问卷结果不参与选模。探针与正式问卷不共用题库条目，但测量主题有重叠。',
'- 入选模型另开请求回答 96 道基础题，再按项目规则做补充题和澄清题。对照组使用同样题目，但无角色观念提示。对照组的默认回答也只是一次模型输出，不代表它拥有个人政治立场。',
`- 已按当次规则复核分数和内部归纳；排名与命中保留原实验口径，不等同于网页给出该标签。另用 ${CLASSIFIER_VERSION} 回放相同答卷的页面展示，没有重新请求模型。`,'',
'## 结果概览','',
`- 有效探针：${pilotSuccess}/${pilotTotal} 个角色×模型组合；${tied} 个角色的最低 MAE 并列。`,
`- 正式问卷完成 ${complete.length}/${roles.length} 组。内部归纳精确命中 ${exact.length}/${complete.length}（${rate(exact.length,complete.length)}）；目标画像为最近坐标 ${top1.length}/${complete.length}（${rate(top1.length,complete.length)}）；目标进入前三 ${top3.length}/${complete.length}（${rate(top3.length,complete.length)}）。最近坐标不是最终分类。`,
`- 对比相同模型无角色提示的探针，入选模型在 ${aligned.length} 个可比角色上的平均贴合度变化为 ${Number.isFinite(mean(aligned))?(mean(aligned)*100).toFixed(1)+' 个百分点':'无数据'}。贴合度定义为 1−MAE/4；它是合成探针指标，受选模过程影响，不是人体测量的准确率。`,
`- 初测请求 ${callLog.length} 次（通过 ${okCount(callLog)} 次）${recoveryDir?`，补测请求 ${followUpCalls.length} 次（通过 ${okCount(followUpCalls)} 次），两阶段合计 ${callLog.length+followUpCalls.length} 次（通过 ${okCount(callLog)+okCount(followUpCalls)} 次）`:''}。请求数包含重试，不含连通性检查。`,
'', '## 逐角色结果','',
'| 目标画像 | 入选模型 | 探针 MAE（越低越贴合） | 基础计分题 | 加题／澄清 | 当次内部归纳 | 当前页面回放 | 目标坐标排名 | 目标距离 |',
'|---|---|---:|---:|---:|---|---|---:|---:|',
...roles.map(([p,r])=>`| ${p.name} | ${r.model??'—'} | ${num(r.pilotFit?.mae)} | ${r.effectiveBase??'—'}/80 | ${r.supplemental??'—'}／${r.clarificationCount??'—'} | ${r.error??actualName(r)}${hit(p,r)?' ✓':''} | ${userView(r)} | ${r.targetRank??'—'} | ${num(r.targetDistance)} |`),
'','## 候选模型的探针表现','',
'| 候选模型 | 有效角色 | 平均 MAE | 独占最低 MAE | 共同最低 MAE | 入选正式测试 |',
'|---|---:|---:|---:|---:|---:|',
...raw.candidates.map(model=>{
  const fits=roles.flatMap(([p])=>raw.pilot[p.id][model].fit?.mae??[]);
  const sole=roles.filter(([p])=>{const w=pilotWinners(p.id);return w.length===1&&w[0]===model;}).length;
  const shared=roles.filter(([p])=>{const w=pilotWinners(p.id);return w.length>1&&w.includes(model);}).length;
  const selected=roles.filter(([,r])=>r.model===model).length;
  return `| ${model} | ${fits.length}/${roles.length} | ${fits.length?num(mean(fits)):'—'} | ${sole} | ${shared} | ${selected} |`;
}),
'','## 无角色提示对照','',
'| 模型 | 当次内部归纳 | 当前页面回放 | 最近坐标 | 有效核心题 |','|---|---|---|---|---:|',
...baselines.map(r=>`| ${r.model} | ${r.error??actualName(r)} | ${userView(r)} | ${name(r.preliminary)} | ${r.effectiveBase??'—'}/80 |`),
'','## 目标与当次内部归纳不一致的案例','',
...mismatches.map(([p,r])=>{
  const diff=r.scores.map((v,i)=>({v,target:p.point[i],dimension:bank.dimensions[i].name})).filter(d=>d.v!==null).sort((a,b)=>Math.abs(b.v-b.target)-Math.abs(a.v-a.target)).slice(0,3);
  return `- **${p.name} → ${actualName(r)}**（${r.model}）：前三坐标为 ${r.top3.map(x=>`${x.name} ${num(x.distance)}`).join('、')||'无'}；目标排名 ${r.targetRank??'—'}，目标距离 ${num(r.targetDistance)}。与目标坐标差距最大的三个维度（实际／参考）：${diff.map(d=>`${d.dimension} ${num(d.v)}／${d.target}`).join('、')}。${r.actual.reasonCodes?.length?' 澄清规则原因：'+r.actual.reasonCodes.join('、')+'。':''}`;
}),
...(recovery?['','## 超时补测','',
'- 只补测初测没有有效答卷的角色和对照组。仍使用原先入选的模型与观念设定，把 96 道基础题改为每批 24 道，各批无共享历史。请求方式不同，因此保留初测统计，补测不替换原结果。',
`- 补测新增 ${recovered.length} 份有效角色答卷，精确命中 ${recovered.filter(([p,r])=>hit(p,r)).length} 例。合计覆盖 ${complete.length+recovered.length}/${roles.length} 个角色。`,
'', '| 补测角色 | 模型 | 当次内部归纳 | 当前页面回放 | 目标坐标排名 |', '|---|---|---|---|---:|',
...repeats.map(r=>`| ${r.role?name(r.role):'无角色提示对照'} | ${r.model} | ${r.error?`${r.error}${r.validBatches!=null?`（${r.validBatches}/${r.totalBatches} 批有效）`:''}`:actualName(r)} | ${userView(r)} | ${r.targetRank??'—'} |`),
'',`补测原始数据与请求日志另存在 [${relative(dir,recoveryDir)}/](${relative(dir,recoveryDir)}/)。`]:[]),
...(bank.version==='2.2.0-exploratory'?['','## 修订题的实际覆盖','',`D9 的 8 道核心题来自 4 个情境，每个情境只对调两种做法的优先顺序。另有 2 个补充情境（4 题）；本轮 ${complete.length+recovered.length} 份有效角色答卷中，${[...complete,...recovered].filter(([,r])=>bank.items.some(q=>q.dimension==='D9'&&q.status==='supplemental'&&r.answers.answers[q.id]!=null)).length} 份回答过 D9 补充题。镜像题不能算作独立情境。`]:[]),
'','## 范围与限制','',
'- 每种角色最多一份有效正式模拟答卷，结果会受模型版本、提示词与采样变化影响。探针选模、角色写法和现有坐标都带有设计者假设。真实误判率、区分效度和人群分布仍需真人研究。',
'- 不应调提示词来追求所有标签命中。尤其要区分：模型有无遵守角色描述、问卷是否测到了关键观念，以及归纳规则如何选择最近参考点。',
'- `protocol.json` 记录预先指定的角色、探针及评分锚点；`pilot.json` 记录各模型探针输出；`calls.jsonl` 记录每次请求的状态、耗时和经校验的回答；`results.json` 包含原始答案包、完整十维分数及归纳细节。没有保存 API 密钥或服务地址。','',
'## 角色写作参考','',
...raw.sources.map(([title,url])=>`- [${title}](${url})`),''];
await writeFile(join(dir,'报告.md'),lines.join('\n'));
console.log(`${complete.length}/${roles.length} valid; exact ${exact.length}; nearest ${top1.length}; top3 ${top3.length}; tied ${tied}; pilot ${pilotSuccess}/${pilotTotal}`);
