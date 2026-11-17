import {adaptivePlan} from './adaptive.mjs';
import {closestMarkdown} from './ideology.mjs';
// Match the reference scorer's ties-to-even rounding for bounded questionnaire scores.
function roundScore(value) {
  const scaled=value*100, lower=Math.floor(scaled), fraction=scaled-lower;
  return (Math.abs(fraction-0.5)<1e-10 ? lower+(lower%2) : Math.round(scaled))/100;
}

export function validateAnswers(answers, bank) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new Error('答案必须是以题目编号为键的对象。');
  const core = new Set(bank.items.filter(i => ['core','supplemental'].includes(i.status)).map(i => i.id));
  const scenes = new Set(bank.scenarios.map(i => i.id));
  const feedback = new Set(bank.feedback.map(i => i.id));
  for (const [key, value] of Object.entries(answers)) {
    if (!core.has(key) && !scenes.has(key) && !feedback.has(key)) throw new Error(`未知或未启用的题目编号：${key}`);
    if (value === null) continue;
    const numeric = Number.isInteger(value) && value >= 1 && value <= 5;
    const valid = core.has(key) ? numeric || ['U','Q'].includes(value) : scenes.has(key) ? ['A','B','C','U'].includes(value) : numeric;
    if (!valid) throw new Error(`${key} 的答案格式无效。`);
  }
  return answers;
}

// Require a versioned envelope: rewritten v2 questions must not silently reuse v1 answers.
export function exportAnswers(answers,bank){
  validateAnswers(answers,bank);
  return {format:'political-values-answers',version:bank.version,answers};
}
export function parseAnswers(text, bank) {
  if(typeof text!=='string' || text.length>100000)throw new Error('答案文件过大。');
  const parsed=JSON.parse(text);
  if(!parsed || parsed.format!=='political-values-answers' || parsed.version!==bank.version || !parsed.answers)
    throw new Error('这不是当前新版的答案文件。旧版答案请到“旧版问卷”入口继续使用，不要直接套用到新版题目。');
  // All accepted nested data is a flat answer map, so global duplicate-key rejection is safe.
  const keys=[...text.matchAll(/"((?:\\.|[^"\\])*)"\s*:/g)].map(m=>JSON.parse(`"${m[1]}"`));
  if(new Set(keys).size!==keys.length)throw new Error('答案包含重复编号。');
  return validateAnswers(parsed.answers,bank);
}

export function score(answers, bank) {
  validateAnswers(answers, bank);
  const plan=adaptivePlan(answers,bank);
  const activeExtras=new Set(plan.flatMap(p=>p.ids));
  const dimensions = bank.dimensions.map(d => {
    const baseItems=bank.items.filter(i=>i.status==='core'&&i.dimension===d.id);
    const items=bank.items.filter(i=>i.dimension===d.id && (i.status==='core'||activeExtras.has(i.id)));
    const baseValues=baseItems.filter(i=>Number.isInteger(answers[i.id])).map(i=>(answers[i.id]-3)*i.direction||0);
    const baseMean=baseValues.length?baseValues.reduce((a,b)=>a+b,0)/baseValues.length:0;
    const baseVariance=baseValues.length?baseValues.reduce((sum,z)=>sum+(z-baseMean)**2,0)/baseValues.length:0;
    const counts = {left:0, neutral:0, right:0, unknown:0, unclear:0, skipped:0};
    const evidence = [];
    for (const item of items) {
      const value = answers[item.id];
      if (Number.isInteger(value)) {
        const z = (value - 3) * item.direction || 0;
        counts[z < 0 ? 'left' : z > 0 ? 'right' : 'neutral']++;
        evidence.push({id:item.id, facet:item.facet, normalized:z});
      } else counts[value === 'U' ? 'unknown' : value === 'Q' ? 'unclear' : 'skipped']++;
    }
    const raw = baseValues.length >= d.minimum_answered ? 25 * (evidence.reduce((sum,i) => sum+i.normalized,0)/evidence.length+2) : null;
    return {...d, answered:evidence.length, total_items:items.length, base_answered:baseValues.length,
      base_score:baseValues.length>=d.minimum_answered?roundScore(25*(baseMean+2)):null,
      base_variance:baseVariance,supplemental_answered:evidence.filter(i=>activeExtras.has(i.id)).length,
      supplemental_offered:items.length-baseItems.length, score:raw === null ? null : roundScore(raw),
      band:raw === null ? null : raw <= 35 ? 'low' : raw >= 65 ? 'high' : 'middle', counts, evidence};
  });
  const byId = Object.fromEntries(dimensions.map(d => [d.id,d]));
  const profiles = bank.profiles.map(p => {
    const supporting=[], contrary=[], uncertain=[];
    for (const req of p.requirements) {
      const d=byId[req.dimension];
      if (d.score === null || d.band === 'middle') uncertain.push(d.id);
      else if (d.band === req.band) supporting.push(d.id);
      else contrary.push(d.id);
    }
    return {...p, triggered:!contrary.length && !uncertain.length, supporting, contrary, uncertain};
  });
  const scenarios = bank.scenarios.map(s => ({id:s.id,theme:s.theme,choice:answers[s.id]??null,text:s.options[answers[s.id]]??null}));
  const pairs=[];
  for (let i=0;i<scenarios.length;i+=2) {
    const a=scenarios[i], b=scenarios[i+1];
    const complete=[a,b].every(s => ['A','B','C'].includes(s.choice));
    pairs.push({theme:a.theme,ids:[a.id,b.id],status:!complete?'信息不足':a.choice===b.choice?'两种条件下选择相同':'条件变化后选择不同'});
  }
  const feedback = bank.feedback.map(f => ({id:f.id,question:f.text,answer:answers[f.id]??null,text:f.options[answers[f.id]]??null}));
  return {version:bank.version,validated:false,dimensions,profiles,scenarios,scenario_pairs:pairs,feedback,scored_answers:dimensions.reduce((sum,d)=>sum+d.base_answered,0),supplemental_answers:dimensions.reduce((sum,d)=>sum+d.supplemental_answered,0),supplemental_offered:activeExtras.size,adaptive:plan};
}

export function describeDimension(d) {
  let text=d.score===null ? '基础题有效作答不足6题，暂不解释方向。' : d.band==='high' ? `本组回答较偏向「${d.high}」。` : d.band==='low' ? `本组回答较偏向「${d.low}」。` : '平均分处于中间区域，请结合题目分布理解。';
  if (d.counts.left>=2 && d.counts.right>=2) text+='不同议题出现双向选择，可能反映混合或条件性立场，不是错误标记。';
  if (d.answered && d.counts.neutral>=d.answered/2) text+='至少一半有效答案为中立。';
  return text;
}

export function markdownReport(result) {
  const lines=['# 政治价值与政策取向报告','',`版本：${result.version}；有效核心作答：${result.scored_answers}/80；有效补充作答：${result.supplemental_answers}/${result.supplemental_offered}。`,'',
    '探索性结果，尚未实证校准。分数不是人口百分位、准确率或价值优劣，不能用于认定身份。','',...closestMarkdown(result),
    '| 维度 | 0端 | 100端 | 分数 | 有效题数 |','|---|---|---|---:|---:|'];
  for (const d of result.dimensions) lines.push(`| ${d.name} | ${d.low} | ${d.high} | ${d.score===null?'信息不足':d.score.toFixed(1)} | ${d.answered}/${d.total_items} |`);
  for(const d of result.dimensions.filter(d=>d.supplemental_offered))lines.push(`- ${d.name}：基础分${d.base_score}；补充${d.supplemental_answered}/${d.supplemental_offered}题后，当前分数${d.score}。补充题与基础题等权，不保证分数更准确。`);
  lines.push('','分数≤35、≥65是未经校准的解释阈值，不是天然政治阵营边界。左右仅代表本维度端点。','');
  for (const d of result.dimensions) lines.push(`- **${d.name}**：${describeDimension(d)} 左向${d.counts.left}、中立${d.counts.neutral}、右向${d.counts.right}；无法判断${d.counts.unknown}、题意不清${d.counts.unclear}、跳过${d.counts.skipped}。`);
  lines.push('','## 情境中的取舍','');
  for (const p of result.scenario_pairs) {
    lines.push(`- **${p.theme}**：${p.status}。`);
    for (const id of p.ids) {const s=result.scenarios.find(x=>x.id===id);lines.push(`  - ${id}：${s.text??'未作答'}`);}
  }
  lines.push('','情境选择不计分；改变选择不代表矛盾，也不能据此估计条件的因果效应。','','## 思想传统参考','');
  const triggered=result.profiles.filter(p=>p.triggered);
  if (!triggered.length) lines.push('尚未触发预设组合提示，或信息不足。未触发并不排除任何思想传统。');
  for (const p of triggered) lines.push(`- **${p.name}**：支持线索：${p.supporting.map(id=>{const d=result.dimensions.find(x=>x.id===id);return `${d.name}（${d.score.toFixed(1)}）`;}).join('、')}。限定：${p.caveat}`);
  lines.push('','提示可以并存，不是匹配概率或唯一分类。','','## 作答状态','');
  for (const f of result.feedback) lines.push(`- ${f.question} ${f.text??'未作答'}。`);
  lines.push('','反馈不改变政治分数，不用于推导诚实程度。没有统计置信区间、人口排名或个人测量误差估计；小幅分差不宜解释为实质差异。','');
  return lines.join('\n');
}
