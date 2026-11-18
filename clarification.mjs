// Clarification is descriptive evidence, never an extra political score.
export const CLARIFICATION_OPTIONS = {
  first:'我通常更支持前一种做法。',
  second:'我通常更支持后一种做法。',
  compromise:'我通常支持两者之间的折中做法。',
  conditional:'要看具体事情；有些支持前一种，有些支持后一种。',
  unsure:'我还没有想清楚。',
  unrepresented:'这两种说法不能表达我的想法。',
};
const endpoints=[
 ['经济分配','少收税，更多自己承担生活开支','多收一些税，提供更多公共保障'],
 ['经济管理','更多由市场决定','更多由公共机构安排'],
 ['个人权利','为安全允许更多限制','更严格保护个人自由'],
 ['权力监督','集中决策，提高执行速度','分散权力，加强监督'],
 ['公众参与','更多交给专家和代表决定','更多让普通公民直接参与'],
 ['传统与生活','更多保留传统生活规则','更多尊重个人生活选择'],
 ['文化与身份','更多强调共同文化','更多支持不同文化共存'],
 ['国家与世界','更多优先照顾本国','更多承担国际合作责任'],
 ['对外安全','更多依靠军力维护安全','更多依靠谈判和克制'],
 ['环境与发展','更多照顾眼前就业和收入','更多保护环境和后代利益'],
];
export const CLARIFICATIONS=endpoints.map(([name,first,second],i)=>({
 id:`C_D${i+1}`,name,status:'clarification',
 text:`${name}：回看刚才的回答，在下面这组取舍中，哪种描述更接近你的想法？`,
 help:`前一种：${first}。后一种：${second}。`,options:CLARIFICATION_OPTIONS,
}));
export function clarificationsFor(bank){
  if(bank?.version!=='2.2.0-exploratory')return CLARIFICATIONS;
  const revised=new Set(['D2','D5','D6','D9']);
  return CLARIFICATIONS.map(q=>{
    const id=q.id.slice(2);
    if(!revised.has(id))return q;
    const {low,high}=bank.dimensions.find(d=>d.id===id);
    return {...q,help:`前一种：${low}。后一种：${high}。`};
  });
}
export function clarificationPages(){return [0,1].map(i=>({
 id:`clarify-${i}`,type:'clarification',short:`澄清 ${i*5+1}–${i*5+5}`,
 title:`再分清一点：折中还是不同取向？ · ${i+1} / 2`,
 description:'前面的平均分接近中间，但原因可能不同。这些题帮助区分主张折中、按事情分别选择和还没想清楚。没有推荐答案，不改变十维分数，可以跳过。',
 ids:CLARIFICATIONS.slice(i*5,i*5+5).map(q=>q.id),
}));}
