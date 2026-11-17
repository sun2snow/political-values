/** A bounded, deterministic follow-up rule, not a calibrated IRT/CAT model. */
export function adaptivePlan(answers, bank) {
  if(!bank.adaptive)return [];
  const config=bank.adaptive;
  return bank.dimensions.flatMap(d=>{
    const base=bank.items.filter(i=>i.status==='core' && i.dimension===d.id);
    const values=base.filter(i=>Number.isInteger(answers[i.id]) && answers[i.id]>=1 && answers[i.id]<=5)
      .map(i=>(answers[i.id]-3)*i.direction || 0);
    const mean=values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
    const variance=values.length?values.reduce((sum,z)=>sum+(z-mean)**2,0)/values.length:0;
    if(values.length<config.minimum_base_answers || variance+1e-12<config.variance_threshold ||
      values.filter(z=>z<0).length<config.minimum_each_direction || values.filter(z=>z>0).length<config.minimum_each_direction)return [];
    return [{dimension:d.id,name:d.name,variance,baseAnswered:values.length,
      ids:bank.items.filter(i=>i.status==='supplemental'&&i.dimension===d.id).slice(0,config.items_per_dimension).map(i=>i.id)}];
  });
}
export function activeQuestionIds(answers,bank){return [...bank.administration_order,...adaptivePlan(answers,bank).flatMap(p=>p.ids)];}
export function createPages(answers,bank){
  const pages=[];
  for(let i=0;i<8;i++)pages.push({id:`base-${i}`,type:'core',short:`基础 ${i*10+1}–${i*10+10}`,title:`你的看法 · 第 ${Math.floor(i/2)+1} 组`,description:'按自己的想法选择。“既不赞同也不反对”表示中立；拿不准时可以选“无法判断”。',ids:bank.administration_order.slice(i*10,i*10+10)});
  for(let i=0;i<3;i++)pages.push({id:`scene-${i}`,type:'scenario',short:`情境 ${i*4+1}–${i*4+4}`,title:`遇到这些情况，你会怎么选？ · ${i+1} / 3`,description:'请按题目给出的情况选择。每种做法都有代价；情况变了，选择也可以变。',ids:bank.scenarios.slice(i*4,i*4+4).map(q=>q.id)});
  pages.push({id:'feedback',type:'feedback',short:'作答反馈',title:'最后，回看这次作答',description:'这4题不影响政治立场分数，只帮助你回顾这次答题，可以跳过。',ids:bank.feedback.map(q=>q.id)});
  for(const p of adaptivePlan(answers,bank))pages.push({id:`extra-${p.dimension}`,type:'supplemental',short:`补充 · ${p.name}`,title:`再了解一点：${p.name}`,description:'在这个方面，你对不同问题的选择差别较大。下面4题换一些角度继续了解你的看法。不同选择很正常，也可以跳过补充题直接查看结果。',ids:p.ids});
  return pages;
}
