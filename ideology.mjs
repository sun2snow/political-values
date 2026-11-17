import {IDEOLOGIES} from './ideology-profiles.mjs';
import {CLARIFICATIONS,CLARIFICATION_OPTIONS} from './clarification.mjs';
// Editorial reference profiles, NOT fitted population clusters or identity diagnoses.
// Coordinate order: D1 redistribution, D2 planning, D3 liberty, D4 checks,
// D5 participation, D6 cultural change, D7 pluralism, D8 global cooperation,
// D9 military restraint, D10 ecology. Every coordinate has equal weight.
export const CLASSIFIER_VERSION = 'nearest-tradition-2.2';
export {IDEOLOGIES} from './ideology-profiles.mjs';

export function preliminaryIdeology(result) {
  const dimensions=Array.from({length:10},(_,i)=>result.dimensions.find(d=>d.id===`D${i+1}`));
  const missing=dimensions.filter(d=>!d || !Number.isFinite(d.score) || (d.base_answered??d.answered)<6);
  if(missing.length) return {version:CLASSIFIER_VERSION,status:'insufficient',name:null,missing:missing.length,
    explanation:`还有 ${missing.length} 个维度信息不足。每个方面至少需要6道有效基础答案，补充后才能总结最贴近的意识形态。`};
  const candidates=IDEOLOGIES.map(p=>({...p,distance:Math.sqrt(dimensions.reduce((sum,d,i)=>sum+(d.score-p.point[i])**2,0)/10)}))
    .sort((a,b)=>a.distance-b.distance || a.id.localeCompare(b.id,'en'));
  const best=candidates[0], gap=candidates[1].distance-best.distance;
  const comparisons=dimensions.map((d,i)=>({id:d.id,name:d.name,score:d.score,target:best.point[i],difference:Math.abs(d.score-best.point[i])}));
  const supporting=[...comparisons].sort((a,b)=>a.difference-b.difference).slice(0,3);
  const contrasts=[...comparisons].filter(d=>d.difference>=20).sort((a,b)=>b.difference-a.difference).slice(0,2);
  const neutralCount=dimensions.reduce((n,d)=>n+d.counts.neutral,0);
  const total=dimensions.reduce((n,d)=>n+d.answered,0);
  const mixedCount=dimensions.filter(d=>d.counts.left>=2&&d.counts.right>=2).length;
  const caveats=[`这是在${IDEOLOGIES.length}种预设参考画像中按十维距离选出的最近一项，不是身份认定或匹配概率；参考点由设计者设定，尚未实证校准。`];
  if(result.supplemental_offered)caveats.push(`本次已回答${result.supplemental_answers}/${result.supplemental_offered}道补充题，总结使用包含有效补充答案的分数；补充题不是准确性的保证。`);
  if(gap<3)caveats.push('与其他参考画像的距离很接近，这个单一总结不稳定；小幅改答就可能改变标签。');
  if(best.distance>=25)caveats.push('即使是最近的一项，也与你的整体画像有明显距离，应优先参考逐维结果。');
  if(neutralCount>=total/2)caveats.push('至少一半有效答案为中立，当前总结可能反映尚未形成明确判断，不宜直接认作稳定的中间立场。');
  if(mixedCount>=3)caveats.push(`${mixedCount} 个维度包含明显双向选择；均值可能掩盖混合立场，接近中间位置不一定意味着主张折中。`);
  return {version:CLASSIFIER_VERSION,status:'matched',id:best.id,name:best.name,description:best.description,
    family:best.family,limitation:best.limitation,distance:best.distance,gap,supporting,contrasts,caveats};
}

export function closestIdeology(result) {
  const initial=preliminaryIdeology(result);
  if(initial.id!=='centrist')return {...initial,clarificationRequired:false};
  const responses=result.clarifications??{};
  const counts=Object.fromEntries(Object.keys(CLARIFICATION_OPTIONS).map(k=>[k,0]));
  for(const q of CLARIFICATIONS)if(Object.hasOwn(counts,responses[q.id]))counts[responses[q.id]]++;
  const completed=Object.values(counts).reduce((a,b)=>a+b,0);
  const middle=result.dimensions.filter(d=>d.score>=35&&d.score<=65).length;
  const mixedDimensions=result.dimensions.filter(d=>d.counts.left>=2&&d.counts.right>=2).map(d=>({id:d.id,name:d.name}));
  const conditionalDimensions=CLARIFICATIONS.filter(q=>responses[q.id]==='conditional').map(q=>({id:q.id.slice(2),name:q.name}));
  const stats={completed,middle,mixedDimensions,conditionalDimensions,counts};
  const shared={version:CLASSIFIER_VERSION,clarificationRequired:true,clarification:stats,
    caveats:[...initial.caveats.map((t,i)=>i===0?`初步比较覆盖${IDEOLOGIES.length}种预设参考画像；接近中间参考点本身不能证明主张折中。参考点尚未实证校准。`:t),'澄清题只辅助区分折中、混合和不确定，不改变十维分数；这些判断阈值尚未实证校准。']};
  if(middle>=8 && mixedDimensions.length<=2 && completed>=8 && counts.compromise>=6 && counts.first+counts.second<=2)
    return {...initial,...shared,caveats:shared.caveats.map(t=>t.startsWith('至少一半有效答案为中立')?'基础与补充答案中至少一半为中立；本次另结合明确支持折中的澄清答案作参考性归纳，不认定稳定身份。':t),reasonCodes:['centrist_confirmed'],description:'本组分数多数接近中间，且你在澄清题中多次明确支持折中做法，因此暂以中间主义概括。'};
  if(mixedDimensions.length>=3 || counts.conditional>=4){
    const names=[...new Set([...mixedDimensions,...conditionalDimensions].map(d=>d.name))];
    return {...shared,status:'mixed',id:null,name:'混合立场，暂不归为单一意识形态',
      reasonCodes:[...(mixedDimensions.length>=3?['bidirectional_dimensions']:[]),...(counts.conditional>=4?['conditional_preferences']:[])],
      description:`这些方面存在不同取向：${names.join('、')}。平均分接近中间，并不等于主张折中。“混合立场”是作答特征，不是新增的思想传统。`};
  }
  const reasons=[];
  if(completed<8)reasons.push(['clarification_incomplete','澄清题完成不足8道']);
  if(counts.unsure||counts.unrepresented)reasons.push(['clarification_uncertain','部分问题尚未想清楚，或选项不能表达你的想法']);
  if(middle<8||counts.first+counts.second>2)reasons.push(['direction_not_confirmed','原分数分布或明确单向选择不支持整体折中的概括']);
  if(counts.compromise<6)reasons.push(['compromise_not_confirmed','明确支持折中的澄清答案不足6道']);
  return {...shared,status:'undetermined',id:null,name:'暂不能确定最贴近的意识形态',reasonCodes:reasons.map(r=>r[0]),
    description:reasons.map(r=>r[1]).join('；')+'。保留十维结果，不自动改判为其他思想传统。'};
}
export function clarificationSummary(result,c=closestIdeology(result)){
  if(!c.clarificationRequired)return [];
  return [`已完成 ${c.clarification.completed}/10 道澄清题；这些答案不改变分数。`,
    ...CLARIFICATIONS.map(q=>`${q.name}：${CLARIFICATION_OPTIONS[result.clarifications?.[q.id]]??'未作答'}`)];
}

export function closestMarkdown(result) {
  const c=closestIdeology(result);
  if(c.status==='insufficient')return ['## 最贴近的意识形态','','暂不能总结：'+c.explanation,''];
  if(c.status!=='matched')return ['## 最贴近的意识形态','',`**${c.name}**`,'',c.description,'',...c.caveats.map(t=>'- '+t),'',...clarificationSummary(result,c).map(t=>'- '+t),'',`归纳规则版本：${c.version}。`,''];
  return ['## 最贴近的意识形态','',`**${c.name}（参考性总结）**`, '',c.description,'',`参考类别：${c.family}。`,`解释边界：${c.limitation}`,'',
    '较接近的维度：'+c.supporting.map(d=>`${d.name} ${d.score.toFixed(1)}（参考点 ${d.target}）`).join('、')+'。',
    c.contrasts.length?'主要差异：'+c.contrasts.map(d=>`${d.name} ${d.score.toFixed(1)}，参考点为 ${d.target}`).join('；')+'。':'没有维度与该参考点相差20分或以上；这不表示所有具体观点都一致。','',...c.caveats.map(t=>'- '+t),'',...clarificationSummary(result,c).map(t=>'- '+t),'',`归纳规则版本：${c.version}。`,''];
}
