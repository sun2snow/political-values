import {readFile,mkdir,writeFile,appendFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {adaptivePlan} from '../../adaptive.mjs';
import {BANK_VERSION,validateAnswers,exportAnswers,score} from '../../core.mjs';
import {clarificationsFor} from '../../clarification.mjs';
import {CLASSIFIER_VERSION,rankedIdeologies,preliminaryIdeology,closestIdeology,IDEOLOGIES} from '../../ideology.mjs';
import {personas,probes,sources} from './personas.mjs';

const out=process.argv[2],primaryDir=process.argv[3];
if(!out)throw new Error('用法：node experiments/ideology/run.mjs <新结果目录> [需补测的初测结果目录]');
const previous=primaryDir?JSON.parse(await readFile(join(primaryDir,'results.json'),'utf8')):null;
const bank=JSON.parse(await readFile(new URL('../../data.json',import.meta.url),'utf8'));
if(bank.version!==BANK_VERSION)throw new Error('只运行当前题库。');
if(previous){
  const protocol=JSON.parse(await readFile(join(primaryDir,'protocol.json'),'utf8'));
  if(previous.version!==bank.version||previous.classifier!==CLASSIFIER_VERSION||JSON.stringify(protocol.personas)!==JSON.stringify(personas))throw new Error('题库、归纳规则或角色提示已变，不能按原协议补测。');
}
const clarifications=clarificationsFor(bank);
const candidates=['gpt-5.6-luna','gemini-3.5-flash-lite','grok-4.7-build-fast'];
const options={'1':'非常不同意','2':'比较不同意','3':'既不赞同也不反对','4':'比较同意','5':'非常同意',U:'不了解／无法判断',Q:'题意不清'};
const byId=new Map([...bank.items,...bank.scenarios,...bank.feedback,...clarifications].map(q=>[q.id,q]));
const anchorIds=new Set(probes.map(([key])=>key));
if(IDEOLOGIES.length!==Object.keys(personas).length||IDEOLOGIES.some(p=>!personas[p.id]))throw new Error('参考画像和实验角色不一致');
for(const [brief] of Object.values(personas))if(IDEOLOGIES.some(p=>brief.includes(p.name)))throw new Error('角色提示含参考画像名称');
for(const [,anchors] of Object.values(personas))for(const [key,value] of Object.entries(anchors)){
  if(!anchorIds.has(key)||value<1||value>5)throw new Error('无效探针锚点');
}
const authFile=process.env.CLIPROXYAPI_CONFIG||join(homedir(),'.pi','agent','cliproxyapi.json');
const {baseUrl,apiKey}=JSON.parse(await readFile(authFile,'utf8'));
const endpoint=new URL('v1/chat/completions',baseUrl);
if(endpoint.protocol!=='https:'&&!['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname))throw new Error('不允许向非 HTTPS 的外部服务发送凭据');
await mkdir(out,{recursive:false});
const log=record=>appendFile(join(out,'calls.jsonl'),JSON.stringify({...record,at:new Date().toISOString()})+'\n');
const baseSystem='这是合成问卷研究，不是现实人物身份，也不需要写政治宣传。按已提供的受访者设定独立判断。不要猜测计分方向、预期分类或怎样得到某个标签。每题按其具体措辞择一，不要添加解释。对于没有明确偏好的题可选中立；确实不了解才选 U。反馈题据实反映本次填写。';
const personaSystem=id=>baseSystem+(id?`\n以下是一个虚构受访者的观念设定。按这些原则作答；未规定的政策结合题意判断。\n${personas[id][0]}`:'\n本轮没有受访者观念设定。用你未受角色提示时的默认判断回答，不要自行选择一个意识形态身份。');
const directions='整数 1=非常不同意、2=比较不同意、3=既不赞同也不反对、4=比较同意、5=非常同意；字符串 U=不了解／无法判断、Q=题意不清。仅在主动跳过时用 null。';
const format='只输出一个标准 JSON 对象：键为题目原编号，值为一个选项编号或 null；不使用 Markdown、不添加额外字段，所有题号都要出现一次。';
function promptFor(ids){
  return `请填写本批题目。${format}\n通用立场题选项：${directions}\n\n${ids.map(id=>{
    const q=byId.get(id);return `${id}：${q.text}${q.help?`\n补充说明：${q.help}`:''}${q.options?`\n仅从这些选项选：${JSON.stringify(q.options)}`:''}`;
  }).join('\n')}`;
}
const pilotPrompt=`以下是单独的研究探针。${format}\n请仅用 1 到 5 的整数：${Object.entries(options).slice(0,5).map(([k,v])=>`${k}=${v}`).join('，')}。\n${probes.map(([key,text])=>`${key}：${text}`).join('\n')}`;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(model,role,stage,prompt,check){
  const expected=stage==='pilot'?1536:4096;
  for(let attempt=1;attempt<=3;attempt++){
    const start=Date.now();let status,reason='network',result,usage;
    try{
      const response=await fetch(endpoint,{method:'POST',redirect:'error',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},
        // No tools, no access to repository/local files, no shared conversation ID or previous messages.
        body:JSON.stringify({model,messages:[{role:'system',content:personaSystem(role)},{role:'user',content:prompt}],max_tokens:expected}),signal:AbortSignal.timeout(55000)});
      status=response.status;
      if(response.ok){
        const b=await response.json(),message=b.choices?.[0]?.message;
        usage=b.usage;
        let text=message?.content?.trim();
        if(!text)reason=message?.refusal?'refusal':'empty';
        else{
          reason='invalid-answer';
          text=text.replace(/^```(?:json)?\s*\n/i,'').replace(/\n```$/,'').trim();
          result=check(JSON.parse(text),text);
        }
      }else{reason=`http-${status}`;await response.body?.cancel();}
    }catch(err){if(reason==='network'&&(err.name==='TimeoutError'||err.name==='AbortError'))reason='timeout';}
    await log({model,role,stage,attempt,status,ms:Date.now()-start,ok:result!==undefined,reason:result===undefined?reason:undefined,usage,answers:result});
    if(result!==undefined)return result;
    if(status&&[400,401,403,404].includes(status))break;
    if(attempt<3)await delay(status===429?5000*attempt:700*attempt);
  }
  return null;
}
function shape(obj,text,ids){
  const keys=[...text.matchAll(/"((?:\\.|[^"\\])*)"\s*:/g)].map(m=>JSON.parse(`"${m[1]}"`));
  if(!obj||Array.isArray(obj)||typeof obj!=='object'||Object.keys(obj).length!==ids.length||keys.length!==ids.length||ids.some(id=>!Object.hasOwn(obj,id)))throw new Error('题号不完整或重复');
  return obj;
}
function checkPilot(obj,text){
  shape(obj,text,[...anchorIds]);
  if(Object.values(obj).some(n=>!Number.isInteger(n)||n<1||n>5))throw new Error('探针选项错误');
  return obj;
}
async function askIds(model,role,stage,ids){
  return request(model,role,stage,promptFor(ids),(obj,text)=>{
    shape(obj,text,ids);
    // Some otherwise compatible models return choice IDs such as "4" for numbers.
    // Canonicalize only unambiguous numeric choice IDs before the production validator.
    const normalized=Object.fromEntries(ids.map(id=>[id,typeof obj[id]==='string'&&/^[1-5]$/.test(obj[id])?Number(obj[id]):obj[id]]));
    validateAnswers(normalized,bank);return normalized;
  });
}
function alignment(role,answers){
  if(!answers)return null;
  const targets=Object.entries(personas[role][1]);
  const mae=targets.reduce((sum,[key,n])=>sum+Math.abs(n-answers[key]),0)/targets.length;
  return {mae,agreement:1-mae/4,n:targets.length};
}
async function fullRun(model,role,{split=false}={}){
  const base=bank.administration_order;
  const batches=split?Array.from({length:Math.ceil(base.length/24)},(_,i)=>base.slice(i*24,i*24+24)):[base];
  const parts=await Promise.all(batches.map((ids,i)=>askIds(model,role,split?`base-${i+1}`:'base',ids)));
  if(parts.some(part=>!part))return {model,role,error:'基础题未返回有效完整答案',validBatches:parts.filter(Boolean).length,totalBatches:batches.length};
  const answers=Object.assign({},...parts);
  const extra=adaptivePlan(answers,bank).flatMap(group=>group.ids);
  if(extra.length){const add=await askIds(model,role,'supplemental',extra);if(!add)return {model,role,error:'补充题未返回有效回答',partial:exportAnswers(answers,bank)};Object.assign(answers,add);}
  if(preliminaryIdeology(score(answers,bank)).id==='centrist'){
    const changes=await askIds(model,role,'clarification',clarifications.map(q=>q.id));
    if(!changes)return {model,role,error:'澄清题未返回有效回答',partial:exportAnswers(answers,bank)};
    Object.assign(answers,changes);
  }
  const r=score(answers,bank),pre=preliminaryIdeology(r),actual=closestIdeology(r),scores=r.dimensions.map(d=>d.score);
  const ranked=rankedIdeologies(r).map(({id,name,distance})=>({id,name,distance}));
  const targetIndex=ranked.findIndex(p=>p.id===role);
  return {model,role,scores,actual,preliminary:pre.id??null,targetRank:targetIndex+1||null,targetDistance:ranked[targetIndex]?.distance??null,
    top3:ranked.slice(0,3),effectiveBase:r.scored_answers,supplemental:r.supplemental_offered,clarificationCount:Object.keys(r.clarifications).length,answers:exportAnswers(answers,bank)};
}
async function pool(tasks){
  let next=0;
  await Promise.all(Array.from({length:Math.min(tasks.length,Number(process.env.EXPERIMENT_CONCURRENCY)||8)},async()=>{
    while(next<tasks.length){const task=tasks[next++];await task();}
  }));
}
async function recover(dir){
  const primary=JSON.parse(await readFile(join(dir,'results.json'),'utf8'));
  const targets=[...Object.values(primary.runs),...Object.values(primary.baselines).map(x=>x.full)].filter(r=>r?.error&&r.model);
  const recovery={started:new Date().toISOString(),protocol:'Separate follow-up for transport/format failures only; same selected model and role; 96 base questions in four independent 24-item calls. No prompt changes or reruns after a valid result.',runs:{},baselines:{}};
  await pool(targets.map(({model,role})=>async()=>{
    const r=await fullRun(model,role,{split:true});
    if(role)recovery.runs[role]=r;else recovery.baselines[model]=r;
    console.log(`follow-up ${role??'control'} ${model}: ${r.actual?.name??r.error}`);
  }));
  recovery.finished=new Date().toISOString();
  await writeFile(join(out,'results.json'),JSON.stringify(recovery,null,2)+'\n');
}
async function primary(){
const result={started:new Date().toISOString(),version:bank.version,classifier:CLASSIFIER_VERSION,candidates,sources,baselines:{},pilot:{},runs:{}};
await writeFile(join(out,'protocol.json'),JSON.stringify({candidates,sources,personas,probes,method:'Probe MAE on prespecified independent anchors; lowest error wins per role, stable candidate-order tiebreak. Every stage and role starts fresh. No score keys or reference coordinates in inference. Three unprompted control runs.',baseRequestItems:bank.administration_order.length,bankVersion:bank.version},null,2)+'\n');
const pilotTasks=candidates.map(model=>async()=>{
  result.baselines[model]={probe:await request(model,null,'pilot',pilotPrompt,checkPilot)};
});
for(const {id} of IDEOLOGIES){
  result.pilot[id]={};
  for(const model of candidates)pilotTasks.push(async()=>{
    const answers=await request(model,id,'pilot',pilotPrompt,checkPilot);
    result.pilot[id][model]={answers,fit:alignment(id,answers)};
  });
}
await pool(pilotTasks);
await writeFile(join(out,'pilot.json'),JSON.stringify({pilot:result.pilot,baselines:result.baselines},null,2)+'\n');
console.log(`pilot complete: ${Object.values(result.pilot).flatMap(Object.values).filter(p=>p.fit).length}/${IDEOLOGIES.length*candidates.length}`);
const fullTasks=candidates.map(model=>async()=>{
  result.baselines[model].full=await fullRun(model,null);console.log(`control ${model}: ${result.baselines[model].full.actual?.status??'error'}`);
});
for(const {id} of IDEOLOGIES){
  const ranked=candidates.filter(model=>result.pilot[id][model].fit).sort((a,b)=>result.pilot[id][a].fit.mae-result.pilot[id][b].fit.mae);
  if(!ranked.length){result.runs[id]={role:id,error:'没有模型通过探针响应校验'};continue;}
  fullTasks.push(async()=>{
    const model=ranked[0];result.runs[id]=await fullRun(model,id);
    result.runs[id].pilotFit=result.pilot[id][model].fit;
    result.runs[id].baselineFit=alignment(id,result.baselines[model].probe);
    console.log(`${id} (${model}): ${result.runs[id].actual?.name??result.runs[id].actual?.status??'error'}, rank=${result.runs[id].targetRank??'-'}`);
  });
}
await pool(fullTasks);
result.finished=new Date().toISOString();
await writeFile(join(out,'results.json'),JSON.stringify(result,null,2)+'\n');
console.log('experiment finished');
}
if(primaryDir)await recover(primaryDir);else await primary();
