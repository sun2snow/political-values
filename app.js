import {CLARIFICATIONS} from './clarification.mjs';
import {questionnairePages} from './flow.mjs';
import {closestIdeology,clarificationSummary,IDEOLOGIES,CLASSIFIER_VERSION} from './ideology.mjs';
import {validateAnswers, parseAnswers, score, describeDimension, markdownReport, exportAnswers as answerEnvelope} from './core.mjs';

const $=s=>document.querySelector(s);
const main=$('#main'), modal=$('#modal'), content=$('#modal-content');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY='political-values-v2-local';
let bank, pages, questions, answers={}, page=0, view='home', remember=false, saveError='', legacyAvailable=false, toastTimer;
let activeQid=null, reportFilter='all', radarCompareId=null, radarMode='standard';

const RADAR_MODES={
  standard:{
    label:'端点视角',
    note:'圆心＝各维度 0 端，虚线环＝50 中线，最外圈＝各维度 100 端（与下方条形图一致）。',
    readoutHint:'点击或悬停图上任意维度节点，查看详细坐标与对照分数（0＝左端，100＝右端）。',
    map:(v)=>v,
    axisLabel:(d)=>d.name,
  },
  autonomy:{
    label:'自主 ↔ 统筹',
    note:'外圈共性：市场分散、个人自主、分权监督与多元开放；内圈共性：公共统筹、安全秩序、传统延续与本国优先（D1、D2 已视觉反向映射，不改真实分数）。',
    readoutHint:'当前为「自主开放 ↔ 统筹本位」投影：D1、D2 外圈代表个人承担与市场决定；点击节点查看真实得分。',
    map:(v,i)=>i<2?100-v:v,
    axisLabel:(d,i)=>['个人承担 (反)','市场决定 (反)','自由保障','分权监督','公民参与','个人选择','多元共存','国际合作','谈判克制','环境后代'][i]??d.name,
  },
  intensity:{
    label:'立场鲜明度',
    note:'内圈共性：接近 50 分中线（折中或双向混合）；外圈共性：鲜明偏向任一端。顶点颜色区分偏向 0 端（橙）或 100 端（绿）。',
    readoutHint:'越靠外圈态度越鲜明（虚线环对应 35/65 阈值）；点击节点查看真实分数与倾向方向。',
    map:(v)=>Math.abs(v-50)*2,
    axisLabel:(d)=>d.name,
  },
};

const coreOptions={'1':'非常不同意','2':'比较不同意','3':'既不赞同也不反对','4':'比较同意','5':'非常同意','U':'不了解／无法判断','Q':'题意不清'};
const activeIds=()=>pages.flatMap(p=>p.ids);
const count=()=>activeIds().filter(id=>answers[id]!=null).length;
const total=()=>activeIds().length;
const pageCount=p=>p.ids.filter(id=>answers[id]!==undefined && answers[id]!==null).length;

function syncPages(){
  const current=pages?.[page]?.id;
  pages=questionnairePages(answers,bank);
  const index=pages.findIndex(p=>p.id===current);
  page=index>=0?index:Math.min(page,pages.length-1);
}

function toast(text){
  const el=$('#notice');
  el.textContent=text;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove('visible'),3800);
}

function showModal(title, body, wide=false){
  modal.classList.toggle('wide-modal', wide);
  content.onclick=null;
  content.innerHTML=`<h2 id="modal-title">${title}</h2>${body}`;
  if(!modal.open)modal.showModal();
}

function persist(){
  if(!remember)return;
  try{localStorage.setItem(KEY,JSON.stringify({version:bank.version,answers,page,view}));saveError='';}
  catch{saveError='此浏览器无法保存进度。请导出答案，关闭页面前自行保留。';toast(saveError);}
}

function setRemember(value){
  remember=value;
  if(value)persist();
  else{try{localStorage.removeItem(KEY);saveError='';}catch{saveError='无法移除本地存档，请使用浏览器网站数据设置清除。';toast(saveError);}}
  const status=$('#save-status');
  if(status){status.textContent=saveStatus();status.className=`fine ${saveError?'save-warning':''}`;}
}

function saveStatus(){return saveError || (remember?'进度保存在此浏览器的本地存储中':'当前仅在本页保留，刷新后会丢失');}
function rememberMarkup(){
  return `<label class="local-option"><input id="remember" type="checkbox" ${remember?'checked':''}><span>在此浏览器保存进度<span class="fine">（共用设备建议关闭）</span></span></label><p id="save-status" class="fine ${saveError?'save-warning':''}">${esc(saveStatus())}</p>`;
}
function bindRemember(){$('#remember')?.addEventListener('change',e=>setRemember(e.target.checked));}

function applyDynamicStyles(){
  document.querySelectorAll('[data-position]').forEach(el=>el.style.setProperty('--position',el.dataset.position+'%'));
  document.querySelectorAll('[data-width]').forEach(el=>el.style.width=el.dataset.width+'%');
  document.querySelectorAll('[data-left]').forEach(el=>el.style.left=el.dataset.left+'%');
  document.querySelectorAll('[data-height]').forEach(el=>el.style.height=el.dataset.height+'%');
}

function focusMain(){main.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
function go(next,nextPage=page){syncPages();view=next;page=Math.max(0,Math.min(pages.length-1,nextPage));persist();render();focusMain();}
function render(){if(view==='quiz')renderQuiz();else if(view==='report')renderReport();else renderHome();}

/* ---------- SVG Radar Helpers ---------- */
function radarPoint(cx,cy,radius,index,totalAxes,value){
  const angle=(-Math.PI/2)+(2*Math.PI*index/totalAxes);
  const r=(Math.max(0,Math.min(100,value))/100)*radius;
  return [cx+r*Math.cos(angle), cy+r*Math.sin(angle), angle];
}

function homeRadarSvg(){
  const cx=140,cy=112,r=76,n=10;
  const sample=[68,42,78,74,58,64,72,80,62,84];
  const rings=[25,50,75,100].map(level=>{
    const pts=Array.from({length:n},(_,i)=>radarPoint(cx,cy,r,i,n,level).slice(0,2).map(v=>v.toFixed(1)).join(',')).join(' ');
    return `<polygon points="${pts}" fill="none" stroke="rgba(255,255,255,${level===50?0.32:0.15})" stroke-width="${level===50?1.2:1}" ${level===50?'stroke-dasharray="3 3"':''}/>`;
  }).join('');
  const spokes=Array.from({length:n},(_,i)=>{
    const [x,y]=radarPoint(cx,cy,r,i,n,100);
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.14)" stroke-width="1"/>`;
  }).join('');
  const polyPts=sample.map((v,i)=>radarPoint(cx,cy,r,i,n,v).slice(0,2).map(x=>x.toFixed(1)).join(',')).join(' ');
  const dots=sample.map((v,i)=>{
    const [x,y]=radarPoint(cx,cy,r,i,n,v);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4" fill="#e7edb7" stroke="#1a4a3e" stroke-width="1.5"/>`;
  }).join('');
  const labels=['分配','管理','权利','监督','参与','传统','文化','国际','安全','环境'].map((lbl,i)=>{
    const [x,y,ang]=radarPoint(cx,cy,r+16,i,n,100);
    const cos=Math.cos(ang),anchor=cos>0.25?'start':cos<-0.25?'end':'middle';
    return `<text x="${x.toFixed(1)}" y="${(y+3.5).toFixed(1)}" text-anchor="${anchor}" fill="rgba(230,240,228,0.86)" font-size="10">${lbl}</text>`;
  }).join('');
  return `<svg class="hero-radar-svg" viewBox="0 0 280 224" role="img" aria-label="十维立场分布示意图">${rings}${spokes}<polygon points="${polyPts}" fill="rgba(220,232,176,0.22)" stroke="#e7edb7" stroke-width="2" stroke-linejoin="round"/>${dots}${labels}</svg>`;
}

function reportRadarSvg(dimensions, compareProfile, mode=radarMode){
  const cfg=RADAR_MODES[mode]||RADAR_MODES.standard;
  const cx=230,cy=206,r=134,n=dimensions.length;
  const rings=mode==='intensity'?[30,60,100]:[25,50,75,100];
  const midRing=mode==='intensity'?30:50;
  const ringsMarkup=rings.map(level=>{
    const pts=Array.from({length:n},(_,i)=>radarPoint(cx,cy,r,i,n,level).slice(0,2).map(v=>v.toFixed(1)).join(',')).join(' ');
    return `<polygon points="${pts}" class="${level===midRing?'radar-grid-mid':'radar-grid-ring'}"/>`;
  }).join('');
  const spokes=Array.from({length:n},(_,i)=>{
    const [x,y]=radarPoint(cx,cy,r,i,n,100);
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="radar-spoke"/>`;
  }).join('');
  const ringLabels=rings.map(level=>{
    const txt=mode==='intensity'?(level===30?'35/65 阈值':level===60?'20/80':'0/100 端点'):mode==='autonomy'?(level===25?'偏统筹':level===50?'中线':level===75?'偏自主':'外圈'):String(level);
    const angle=(-Math.PI/2)+(Math.PI/10);
    const dist=(level/100)*r;
    const lx=cx+dist*Math.cos(angle), ly=cy+dist*Math.sin(angle);
    return `<text x="${lx.toFixed(1)}" y="${(ly+3).toFixed(1)}" text-anchor="middle" font-size="9" fill="#7c857d">${txt}</text>`;
  }).join('');
  const refPoly=compareProfile?`<polygon points="${compareProfile.point.map((v,i)=>radarPoint(cx,cy,r,i,n,cfg.map(v,i)).slice(0,2).map(x=>x.toFixed(1)).join(',')).join(' ')}" class="radar-poly-ref"/>`:'';
  const allScored=dimensions.every(d=>d.score!==null);
  const userPts=dimensions.map((d,i)=>radarPoint(cx,cy,r,i,n,cfg.map(d.score??50,i)).slice(0,2).map(x=>x.toFixed(1)).join(',')).join(' ');
  const userPoly=allScored?`<polygon points="${userPts}" class="radar-poly-user"/>`:'';
  const vertices=dimensions.map((d,i)=>{
    if(d.score===null)return '';
    const [x,y]=radarPoint(cx,cy,r,i,n,cfg.map(d.score,i));
    const dirCls=mode==='intensity'?(d.score<=35?'dir-left':d.score>=65?'dir-right':'dir-mid'):'';
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.9" class="radar-vertex ${dirCls}" tabindex="0" data-dim-index="${i}" aria-label="${esc(cfg.axisLabel(d,i))}：真实得分 ${d.score.toFixed(1)}分"/>`;
  }).join('');
  const labels=dimensions.map((d,i)=>{
    const [x,y,ang]=radarPoint(cx,cy,r+20,i,n,100);
    const cos=Math.cos(ang),sin=Math.sin(ang);
    const anchor=cos>0.25?'start':cos<-0.25?'end':'middle';
    const dy=sin>0.4?8:sin<-0.4?-2:3.5;
    return `<text x="${x.toFixed(1)}" y="${(y+dy).toFixed(1)}" text-anchor="${anchor}" class="radar-label" data-dim-index="${i}">${esc(cfg.axisLabel(d,i))}</text>`;
  }).join('');
  return `<svg class="radar-svg" viewBox="0 0 460 412" role="img" aria-label="你的十个维度得分雷达图">${ringsMarkup}${spokes}${ringLabels}${userPoly}${refPoly}${vertices}${labels}</svg>`;
}

function rankedIdeologies(result){
  const dims=Array.from({length:10},(_,i)=>result.dimensions.find(d=>d.id===`D${i+1}`));
  if(dims.some(d=>!d || d.score===null || (d.base_answered??d.answered)<6))return [];
  return IDEOLOGIES.map(p=>({...p,distance:Math.sqrt(dims.reduce((sum,d,i)=>sum+(d.score-p.point[i])**2,0)/10)}))
    .sort((a,b)=>a.distance-b.distance || a.id.localeCompare(b.id,'en'));
}

/* ---------- Home View ---------- */
function homeGraphic(){
  return `<aside class="hero-card" aria-label="多维画像示意图，示意位置不是你的结果">
    <div class="hero-card-top">
      <span class="card-label">MORE THAN LEFT &amp; RIGHT</span>
      <span class="hero-card-tag">10维立体坐标</span>
    </div>
    <h2>你的观点，<br>可以不在同一条线上。</h2>
    <div class="hero-radar-wrap">${homeRadarSvg()}</div>
    ${[['市场配置','公共规划',30],['集中裁量','权力制衡',74],['文化延续','个人自主',58],['当期增长','代际责任',84]].map(([l,r,p])=>`<div class="mini-row"><div class="mini-label"><span>${l}</span><span>${r}</span></div><div class="mini-axis" data-position="${p}"></div></div>`).join('')}
    <small>维度示意 · 非个人结果 · 不作优劣判断</small>
  </aside>`;
}

function renderHome(){
  const answered=count(), all=total(), pct=all?Math.round(answered/all*100):0;
  main.innerHTML=`<section class="hero">
    <div>
      <p class="eyebrow">A map of your political values · 探索版 v2.1</p>
      <h1>理解立场，<br>从看见<em>取舍</em>开始。</h1>
      <p class="lead">关于公平、自由、传统与共同生活，你如何作出选择？从十个独立视角探索政治价值，认识那些无法被一个简单标签概括的自己。</p>
      <div class="metrics">
        <div class="metric"><strong>96<span class="metric-plus"> + 0–50</span></strong><span>道基础题 · 按需补充</span></div>
        <div class="metric"><strong>10</strong><span>个独立呈现的维度</span></div>
        <div class="metric"><strong>25–35</strong><span>分钟 · 答案仅留本地</span></div>
      </div>
      ${answered?`<div class="resume-card">
        <div class="resume-head"><span>检测到未完成的作答</span><span class="pill">${answered} / ${all} 题 (${pct}%)</span></div>
        <div class="resume-bar"><div class="resume-bar-fill" data-width="${pct}"></div></div>
        <div class="actions">
          <button class="button" id="start">继续作答 <span aria-hidden="true">↗</span></button>
          <button class="button secondary" id="existing-result">查看当前结果</button>
          <button class="text-button" id="import-home">导入答案</button>
        </div>
      </div>`:`<div class="actions">
        <button class="button" id="start">开始探索 <span aria-hidden="true">↗</span></button>
        <button class="button secondary" id="import-home">导入已有答案</button>
      </div>`}
      ${rememberMarkup()}
      ${legacyAvailable?'<p class="notice-box">检测到旧版（v1）进度。新版题目已改写，旧答案不会自动套用。<a href="legacy/v1/">继续旧版问卷 ↗</a></p>':''}
    </div>
    ${homeGraphic()}
  </section>
  <section class="intro-bottom" aria-label="测试说明">
    <div class="intro-feature"><span class="number">01 / 多维，而非单一标签</span><h3>保留复杂，也保留不同</h3><p>经济、文化与制度观点分别呈现。混合立场很正常，不需要为了“保持一致”而改变答案。</p></div>
    <div class="intro-feature"><span class="number">02 / 答案留在你的设备</span><h3>由你决定保存与分享</h3><p>答案只在浏览器本地计分，不上传、不设账号、无统计追踪。保存进度需要主动勾选。</p></div>
    <div class="intro-feature"><span class="number">03 / 坦诚面对测量边界</span><h3>一份探索性的问卷</h3><p>问卷尚未经真人样本校准。结果用于自我整理与理解，不是诊断、人口排名或身份认定。</p></div>
  </section>
  <div class="load-tools">
    <div class="notice-box">请按自己的真实看法作答，没有标准答案。所有题目均可跳题、暂停或修改。“中立”与“无法判断”是不同的选择。基础题完成后，如果某个方面的选择分散度较大，会增加4道可跳过的补充题；初步画像接近中间时，另有10道可跳过的澄清题，不改变分数。</div>
    <div class="tool-links">
      <a href="questionnaire-v2.zip" download>下载新版问卷与方法文档 ↗</a>
      <span class="sep" aria-hidden="true">·</span>
      <button type="button" class="text-button" id="home-profiles-btn">浏览 24 种参考画像</button>
      <span class="sep" aria-hidden="true">·</span>
      <a href="legacy/v1/">使用旧版问卷 (v1)</a>
    </div>
  </div>`;
  applyDynamicStyles();
  $('#start').onclick=()=>go('quiz',answered?page:0);
  $('#import-home').onclick=openImport;
  $('#existing-result')?.addEventListener('click',confirmReport);
  $('#home-profiles-btn')?.addEventListener('click',openProfilesModal);
  bindRemember();
}

/* ---------- Quiz View ---------- */
function answerLabel(q, val){
  if(val===undefined || val===null)return null;
  if(q.dimension)return coreOptions[String(val)];
  if(q.theme)return `${val} · ${q.options[val]}`;
  return q.options[String(val)];
}

function questionStateMeta(q, val){
  if(val===undefined || val===null)return {cls:'',badgeCls:'',badgeText:'未作答'};
  if(val==='U' || val==='Q' || val==='unsure' || val==='unrepresented')
    return {cls:'is-uncertain',badgeCls:'uncertain',badgeText:q.dimension?coreOptions[val]:q.options[val]};
  const short=q.dimension?coreOptions[String(val)]:q.theme?`已选 ${val}`:q.options[String(val)];
  return {cls:'is-answered',badgeCls:'answered',badgeText:`已选：${short}`};
}

function questionMarkup(id,index){
  const q=questions[id],isCore=!!q.dimension,isScene=!!q.theme,isClarify=q.status==='clarification';
  const options=isCore?coreOptions:q.options;
  const val=answers[id];
  const state=questionStateMeta(q,val);
  const choices=Object.entries(options).map(([key,label],optIdx)=>{
    const value=isCore||!isScene ? (/^[1-5]$/.test(key)?Number(key):key):key;
    const checked=val===value?'checked':'';
    const keyBadge=isCore && /^[1-5]$/.test(key)
      ? `<span class="option-key" aria-hidden="true">${key}</span>`
      : isScene
      ? `<span class="option-letter" aria-hidden="true">${key}</span>`
      : isClarify || !isCore
      ? `<span class="option-letter" aria-hidden="true">${optIdx+1}</span>`
      : '';
    return {key,html:`<label class="option"><input type="radio" name="${id}" value="${key}" ${checked}>${keyBadge}<span>${esc(label)}</span></label>`};
  });
  const primary=choices.filter(c=>!isCore || /^[1-5]$/.test(c.key)).map(c=>c.html).join('');
  const extra=choices.filter(c=>isCore&&!/^[1-5]$/.test(c.key)).map(c=>c.html).join('');
  const numLabel=q.status==='clarification'?'澄清':q.status==='supplemental'?'补充':`${String(index+1).padStart(2,'0')} / 96`;
  return `<fieldset class="question ${isScene?'scenario':isClarify?'clarification':isCore?'':'feedback'} ${state.cls} ${activeQid===id?'is-active':''}" id="q-wrap-${id}" data-qid="${id}" tabindex="-1">
    <div class="q-header">
      <span class="q-number">${numLabel} · ${id}</span>
      <span class="q-state-badge ${state.badgeCls}" data-badge="${id}">${esc(state.badgeText)}</span>
    </div>
    <legend>${esc(q.text)}</legend>
    ${q.help?`<p class="question-help">${esc(q.help)}</p>`:''}
    <div class="options">${primary}</div>
    <div class="extra-options">${extra}<button type="button" class="clear-answer" data-clear="${id}" aria-label="清空${['supplemental','clarification'].includes(q.status)?id:'第'+(index+1)+'题'}的选择">清空选择 / 跳过</button></div>
  </fieldset>`;
}

function pageDotsMarkup(p){
  return p.ids.map((id,idx)=>{
    const v=answers[id];
    const cls=v==null?'':(['U','Q','unsure','unrepresented'].includes(v)?'is-uncertain':'is-answered');
    const cur=activeQid===id?'is-current':'';
    return `<button type="button" class="page-dot ${cls} ${cur}" data-jump-q="${id}" title="跳到本页第 ${idx+1} 题">${idx+1}</button>`;
  }).join('');
}

function sectionBadgeText(p){
  if(p.type==='core')return `基础作答 · ${p.short}`;
  if(p.type==='scenario')return `情境取舍 · ${p.short}`;
  if(p.type==='feedback')return '作答反馈';
  if(p.type==='supplemental')return p.short;
  return p.short;
}

function renderQuiz(){
  const p=pages[page];
  const answered=count(), all=total(), pct=all?Math.round(answered/all*100):0;
  const firstUnanswered=p.ids.find(id=>answers[id]==null);
  if(!activeQid || !p.ids.includes(activeQid))activeQid=p.ids[0];
  const extraCallout=p.type==='supplemental'
    ? `<div class="notice-box">你在该维度的基础作答呈现出有意思的双向分布，以下 4 道补充题从不同情境继续了解你的看法。可全部或部分跳过，不会降低现有结论的效力。</div>`
    : p.type==='clarification'
    ? `<div class="notice-box amber">你的十维初步平均分接近中间区域。以下 10 题帮助区分「主张折中」「不同议题有不同取向」与「尚未确定」，<strong>不会改变任何十维分数</strong>，也可以跳过。</div>`
    : '';
  main.innerHTML=`<div class="quiz-shell">
    <div class="quiz-top">
      <div class="quiz-meta">
        <div class="quiz-meta-left">
          <span class="pill">${esc(sectionBadgeText(p))}</span>
          <span class="quiz-progress-text" id="progress-label">已选择 ${answered} / ${all} 题 (${pct}%)</span>
        </div>
        <div class="quiz-meta-right">
          <button type="button" class="text-button" id="jump-unanswered" ${firstUnanswered?'':'hidden'}>跳到未答题</button>
          <button type="button" class="text-button" id="overview">题目导航 · 第 ${page+1} / ${pages.length} 页</button>
        </div>
      </div>
      <div class="progress" role="progressbar" aria-label="已选择题目数" aria-valuemin="0" aria-valuemax="${all}" aria-valuenow="${answered}"><div class="progress-fill" data-width="${all?(answered/all*100).toFixed(2):0}"></div></div>
      <div class="page-dots" id="page-dots" aria-label="本页题目快速定位">${pageDotsMarkup(p)}</div>
    </div>
    <div class="section-heading">
      <p class="eyebrow">${p.type==='supplemental'?'A CLOSER LOOK':p.type==='core'?'YOUR VALUES':p.type==='scenario'?'VALUES IN CONTEXT':p.type==='clarification'?'CLARIFYING THE CENTER':'ABOUT THIS SESSION'}</p>
      <h1>${p.title}</h1>
      <p>${p.description}</p>
    </div>
    ${extraCallout}
    ${page>0&&[2,4,6,8].includes(page)?'<div class="rest">可以在这里稍作休息。你的观点无需与其他题目保持表面一致，按当下的真实想法作答即可。</div>':''}
    <div id="questions">${p.ids.map(id=>questionMarkup(id,activeIds().indexOf(id))).join('')}</div>
    <div class="quiz-nav">
      <button type="button" class="button secondary" id="previous">${page===0?'返回首页':'← 上一页'}</button>
      <span class="fine">本页已答 ${pageCount(p)} / ${p.ids.length} · 所有题目均可跳过</span>
      <button type="button" class="button" id="next">${page===pages.length-1?'查看我的画像':'下一页 →'}</button>
    </div>
    <div class="quiz-footer-tools">
      <div>${rememberMarkup()}</div>
      <div class="actions">
        <button type="button" class="text-button" id="export-progress">导出答案</button>
        <button type="button" class="text-button" id="preview-result">${p.type==='clarification'?'跳过剩余澄清题，查看结果':p.type==='supplemental'?'跳过剩余补充题，查看结果':'查看当前结果'}</button>
      </div>
    </div>
    <p class="kbd-hint">快捷键：聚焦或点击某道题后，可按 <kbd>1</kbd>–<kbd>5</kbd> 快捷作答（立场题可按 <kbd>U</kbd> 无法判断、<kbd>Q</kbd> 题意不清，<kbd>Backspace</kbd> 清空）。</p>
  </div>`;
  applyDynamicStyles();

  const qContainer=$('#questions');
  qContainer.addEventListener('focusin',e=>{
    const fs=e.target.closest('fieldset[data-qid]');
    if(fs)setActiveQuestion(fs.dataset.qid);
  });
  qContainer.addEventListener('click',e=>{
    const fs=e.target.closest('fieldset[data-qid]');
    if(fs)setActiveQuestion(fs.dataset.qid);
    const button=e.target.closest('[data-clear]');
    if(!button)return;
    const qid=button.dataset.clear;
    delete answers[qid];
    button.closest('fieldset').querySelectorAll('input').forEach(i=>i.checked=false);
    syncPages();persist();refreshQuestionUI(qid);updateProgress();
    toast('已清空这一题。');
  });
  qContainer.addEventListener('change',e=>{
    const el=e.target;if(el.type!=='radio')return;
    answers[el.name]=/^[1-5]$/.test(el.value)?Number(el.value):el.value;
    syncPages();persist();refreshQuestionUI(el.name);updateProgress();
  });

  $('#page-dots').addEventListener('click',e=>{
    const btn=e.target.closest('[data-jump-q]');
    if(!btn)return;
    scrollToQuestion(btn.dataset.jumpQ);
  });
  $('#jump-unanswered')?.addEventListener('click',()=>{
    const target=pages[page].ids.find(id=>answers[id]==null);
    if(target)scrollToQuestion(target);
  });
  $('#previous').onclick=()=>page===0?go('home'):go('quiz',page-1);
  $('#next').onclick=()=>page===pages.length-1?confirmReport():go('quiz',page+1);
  $('#overview').onclick=openOverview;
  $('#export-progress').onclick=exportAnswers;
  $('#preview-result').onclick=confirmReport;
  bindRemember();
}

function setActiveQuestion(qid){
  if(activeQid===qid)return;
  if(activeQid)document.getElementById(`q-wrap-${activeQid}`)?.classList.remove('is-active');
  activeQid=qid;
  document.getElementById(`q-wrap-${qid}`)?.classList.add('is-active');
  document.querySelectorAll('#page-dots .page-dot').forEach(d=>d.classList.toggle('is-current',d.dataset.jumpQ===qid));
}

function scrollToQuestion(qid){
  const el=document.getElementById(`q-wrap-${qid}`);
  if(!el)return;
  setActiveQuestion(qid);
  const top=el.getBoundingClientRect().top+window.scrollY-132;
  window.scrollTo({top:Math.max(0,top),behavior:'smooth'});
}

function refreshQuestionUI(qid){
  const fs=document.getElementById(`q-wrap-${qid}`);
  if(!fs)return;
  const meta=questionStateMeta(questions[qid],answers[qid]);
  fs.classList.remove('is-answered','is-uncertain');
  if(meta.cls)fs.classList.add(meta.cls);
  const badge=fs.querySelector(`[data-badge="${qid}"]`);
  if(badge){badge.textContent=meta.badgeText;badge.className=`q-state-badge ${meta.badgeCls}`;}
}

function updateProgress(){
  const p=pages[page], answered=count(), all=total(), pct=all?Math.round(answered/all*100):0;
  const bar=$('.progress');
  bar.setAttribute('aria-valuemax',all);
  bar.setAttribute('aria-valuenow',answered);
  $('.progress-fill').style.width=(all?(answered/all*100):0)+'%';
  $('#overview').textContent=`题目导航 · 第 ${page+1} / ${pages.length} 页`;
  $('#next').textContent=page===pages.length-1?'查看我的画像':'下一页 →';
  $('#progress-label').textContent=`已选择 ${answered} / ${all} 题 (${pct}%)`;
  const dots=$('#page-dots');
  if(dots)dots.innerHTML=pageDotsMarkup(p);
  const navFine=$('.quiz-nav .fine');
  if(navFine)navFine.textContent=`本页已答 ${pageCount(p)} / ${p.ids.length} · 所有题目均可跳过`;
  const jumpBtn=$('#jump-unanswered');
  if(jumpBtn)jumpBtn.hidden=!p.ids.some(id=>answers[id]==null);
  const status=$('#save-status');
  if(status)status.textContent=saveStatus();
}

// Keyboard shortcuts during quiz view
document.addEventListener('keydown',e=>{
  if(view!=='quiz' || modal.open)return;
  const tag=document.activeElement?.tagName;
  if(['INPUT','TEXTAREA','SELECT'].includes(tag) && document.activeElement.type!=='radio')return;
  if(e.metaKey || e.ctrlKey || e.altKey)return;
  const p=pages?.[page];
  if(!p || !activeQid || !p.ids.includes(activeQid))return;
  const q=questions[activeQid];
  const key=e.key.toUpperCase();
  let mapped=null;
  if(q.dimension){
    if(/^[1-5]$/.test(key))mapped=key;
    else if(key==='U'||key==='Q')mapped=key;
  }else if(q.theme){
    if(['A','B','C','U'].includes(key))mapped=key;
  }else if(q.status==='clarification'){
    const keys=Object.keys(q.options);
    if(/^[1-6]$/.test(key))mapped=keys[Number(key)-1];
  }else{
    if(/^[1-5]$/.test(key))mapped=key;
  }
  if(e.key==='Backspace' || e.key==='0'){
    e.preventDefault();
    delete answers[activeQid];
    document.getElementById(`q-wrap-${activeQid}`)?.querySelectorAll('input').forEach(i=>i.checked=false);
    syncPages();persist();refreshQuestionUI(activeQid);updateProgress();
    return;
  }
  if(mapped){
    const input=document.querySelector(`fieldset[data-qid="${activeQid}"] input[value="${mapped}"]`);
    if(input){
      e.preventDefault();
      input.checked=true;
      answers[activeQid]=/^[1-5]$/.test(mapped)?Number(mapped):mapped;
      syncPages();persist();refreshQuestionUI(activeQid);updateProgress();
    }
  }
});

/* ---------- Overview & Confirm Modals ---------- */
function openOverview(){
  showModal('题目导航',`<p>点击任意页面即可跳转修改答案。计数包含“无法判断”和“题意不清”。</p>
    <div class="page-grid">${pages.map((p,i)=>{
      const done=pageCount(p), len=p.ids.length, pct=len?Math.round(done/len*100):0;
      return `<button type="button" class="page-link ${i===page?'active':''} ${done===len?'complete':''}" data-page="${i}">${esc(p.short)}<span>${done} / ${len} 题</span><div class="page-link-bar"><div class="page-link-bar-fill" data-width="${pct}"></div></div></button>`;
    }).join('')}</div>
    <div class="actions"><button type="button" class="button secondary" id="nav-export">导出答案</button><button type="button" class="button secondary" id="nav-import">导入答案</button><button type="button" class="text-button" id="nav-home">返回首页</button></div>`);
  applyDynamicStyles();
  content.querySelectorAll('[data-page]').forEach(el=>el.onclick=()=>{modal.close();go('quiz',Number(el.dataset.page));});
  $('#nav-export').onclick=exportAnswers;
  $('#nav-import').onclick=openImport;
  $('#nav-home').onclick=()=>{modal.close();go('home');};
}

function confirmReport(){
  const result=score(answers,bank), insufficient=result.dimensions.filter(d=>d.score===null);
  const firstClarification=pages.findIndex(p=>p.type==='clarification'&&p.ids.some(id=>answers[id]==null));
  if(firstClarification>=0 && !(view==='quiz'&&pages[page].type==='clarification')){go('quiz',firstClarification);return;}
  const missing=total()-count();
  if(!missing&&!insufficient.length){go('report');return;}
  showModal('按当前答案生成画像',`<p>当前已选择 <strong>${count()} / ${total()}</strong> 题；可计分核心答案 <strong>${result.scored_answers} / 80</strong> 题。</p>
    <p>${insufficient.length?`${insufficient.length} 个维度不足6道有效答案，将显示“信息不足”。`:'全部维度已达到最低计分门槛。'} “无法判断”和“题意不清”不计入分数。</p>
    <p>已回答 ${result.supplemental_answers} / ${result.supplemental_offered} 道补充题。补充题可以跳过。</p>
    <p>澄清题也可以跳过；没有足够证据时，不会把平均分接近中间直接认定为中间主义。可以先查看结果，之后仍可随时回来修改。</p>
    <div class="actions"><button type="button" class="button" id="confirm-report">查看当前画像</button><button type="button" class="button secondary" id="fill-missing">继续补充答案</button></div>`);
  $('#confirm-report').onclick=()=>{modal.close();go('report');};
  $('#fill-missing').onclick=()=>{modal.close();const first=pages.findIndex(p=>p.ids.some(id=>answers[id]==null || ['U','Q'].includes(answers[id])));go('quiz',first<0?page:first);};
}

/* ---------- Report View ---------- */
function closestMarkup(result, ranked){
  const c=closestIdeology(result);
  if(c.status==='insufficient')return `<section class="ideology-summary" aria-labelledby="ideology-heading">
    <div><p class="eyebrow">YOUR CLOSEST TRADITION</p><h2 id="ideology-heading">最贴近的意识形态</h2><p>${esc(c.explanation)}</p></div>
    <p class="fine">请先完成每个维度至少6道有效基础题，系统才能生成十维距离对照。</p>
  </section>`;

  const clarificationHtml=clarificationSummary(result,c);
  const top3Html=ranked.length?`<div class="nearest-strip">
    <span class="nearest-strip-label">十维几何距离最近的参考画像（点击可在右图对照）：</span>
    <div class="nearest-chips">${ranked.slice(0,3).map((item,idx)=>`<button type="button" class="nearest-chip ${radarCompareId===item.id?'active':''}" data-compare-id="${item.id}">${idx+1}. ${esc(item.name)} <small>距离 ${item.distance.toFixed(1)}</small></button>`).join('')}</div>
  </div>`:'';

  if(c.status!=='matched')return `<section class="ideology-summary" aria-labelledby="ideology-heading">
    <div>
      <p class="eyebrow">YOUR VIEWS IN CONTEXT</p>
      <span class="pill amber">${c.status==='mixed'?'双向 / 条件取向':'证据暂不足'}</span>
      <h2 id="ideology-heading">${esc(c.name)}</h2>
      <p>${esc(c.description)}</p>
      <div class="ideology-detail-block">
        ${c.caveats.map(t=>`<p>${esc(t)}</p>`).join('')}
        ${clarificationHtml.length?`<details><summary>查看澄清题逐项记录（${c.clarification.completed}/10）</summary>${clarificationHtml.slice(1).map(t=>`<p>${esc(t)}</p>`).join('')}</details>`:''}
      </div>
      ${top3Html}
    </div>
    <a class="fine" href="docs/最贴近意识形态规则.html" target="_blank" rel="noopener">查看归纳方法与全部参考画像 ↗</a>
  </section>`;

  return `<section class="ideology-summary" aria-labelledby="ideology-heading">
    <div>
      <p class="eyebrow">YOUR CLOSEST TRADITION</p>
      <div class="ideology-meta-chips">
        <span class="pill">${esc(c.family)}</span>
        <span class="pill subtle">十维距离 ${c.distance.toFixed(1)}</span>
      </div>
      <h2 id="ideology-heading">${esc(c.name)}</h2>
      <p>${esc(c.description)}</p>
      <div class="ideology-detail-block">
        <p><strong>较接近的维度：</strong>${c.supporting.map(d=>`${esc(d.name)} ${d.score.toFixed(1)}（参考点 ${d.target}）`).join('、')}。</p>
        <p><strong>主要差异：</strong>${c.contrasts.length?c.contrasts.map(d=>`${esc(d.name)} ${d.score.toFixed(1)}，参考点为 ${d.target}`).join('；')+'。':'没有维度与参考点相差20分或以上；这不表示所有具体观点都一致。'}</p>
        <p><strong>解释边界：</strong>${esc(c.limitation)}</p>
      </div>
      ${c.caveats.map(t=>`<p class="fine">${esc(t)}</p>`).join('')}
      ${clarificationHtml.length?`<details><summary>澄清题记录（${c.clarification.completed}/10）</summary>${clarificationHtml.slice(1).map(t=>`<p>${esc(t)}</p>`).join('')}</details>`:''}
      ${top3Html}
    </div>
    <a class="fine" href="docs/最贴近意识形态规则.html" target="_blank" rel="noopener">查看归纳方法与全部参考画像 ↗</a>
  </section>`;
}

function dimensionCardMarkup(d){
  const bandPill=d.score===null
    ? `<span class="pill subtle">信息不足</span>`
    : d.band==='low'
    ? `<span class="pill terracotta">偏向左端</span>`
    : d.band==='high'
    ? `<span class="pill">偏向右端</span>`
    : `<span class="pill subtle">中间区域</span>`;
  const extraPill=d.supplemental_offered?`<span class="pill amber">已触发补充 ${d.supplemental_answered}/${d.supplemental_offered}</span>`:'';
  const isMixed=d.counts.left>=2 && d.counts.right>=2;
  const mixedPill=isMixed?`<span class="pill subtle">双向分布</span>`:'';
  const tot=Math.max(1,d.total_items);
  const wLeft=(d.counts.left/tot*100).toFixed(2);
  const wNeutral=(d.counts.neutral/tot*100).toFixed(2);
  const wRight=(d.counts.right/tot*100).toFixed(2);
  const wOther=((d.counts.unknown+d.counts.unclear+d.counts.skipped)/tot*100).toFixed(2);
  const showBase=d.supplemental_offered && d.base_score!==null && d.score!==null && Math.abs(d.base_score-d.score)>=0.05;

  return `<article class="dimension">
    <div>
      <div class="dimension-head">
        <div class="dimension-title-wrap">
          <h3>${esc(d.id)} · ${esc(d.name)}</h3>
          <div class="dimension-badges">${bandPill}${extraPill}${mixedPill}</div>
        </div>
        <span class="score ${d.score===null?'missing-score':''}">${d.score===null?'信息不足':d.score.toFixed(1)} <small>${d.score===null?'':'/ 100'}</small></span>
      </div>
      <div class="axis-labels"><span>${esc(d.low)}</span><span>${esc(d.high)}</span></div>
      <div class="axis ${d.score===null?'missing':''}" aria-hidden="true">
        <span class="axis-tick" data-left="35"></span>
        <span class="axis-tick" data-left="65"></span>
        ${showBase?`<span class="axis-base-dot" data-left="${d.base_score}" title="基础分 ${d.base_score}"></span>`:''}
        ${d.score===null?'':`<span class="axis-dot" data-left="${d.score}" title="当前分数 ${d.score.toFixed(1)}"></span>`}
      </div>
      <p class="dimension-desc">${esc(describeDimension(d))}</p>
      ${d.supplemental_offered?`<p class="supplement-note">基础分 ${d.base_score}；已回答 ${d.supplemental_answered}/${d.supplemental_offered} 道补充题，当前分数已等权合并计算（补充题不保证更准确）。</p>`:''}
    </div>
    <div class="composition-wrap">
      <div class="composition-bar" aria-hidden="true">
        <span class="comp-seg left" data-width="${wLeft}"></span>
        <span class="comp-seg neutral" data-width="${wNeutral}"></span>
        <span class="comp-seg right" data-width="${wRight}"></span>
        <span class="comp-seg other" data-width="${wOther}"></span>
      </div>
      <div class="counts">有效 ${d.answered}/${d.total_items}（左向 ${d.counts.left} · 中立 ${d.counts.neutral} · 右向 ${d.counts.right}）· 无法判断 ${d.counts.unknown} · 题意不清 ${d.counts.unclear} · 跳过 ${d.counts.skipped}</div>
    </div>
  </article>`;
}

function filteredDimensions(dimensions){
  if(reportFilter==='extreme')return dimensions.filter(d=>d.band==='low'||d.band==='high');
  if(reportFilter==='middle')return dimensions.filter(d=>d.band==='middle');
  if(reportFilter==='mixed')return dimensions.filter(d=>d.supplemental_offered>0||(d.counts.left>=2&&d.counts.right>=2));
  return dimensions;
}

function radarLegendMarkup(compareProfile, mode=radarMode){
  const base=`<span class="legend-item"><span class="legend-swatch user"></span>你的十维画像</span>${compareProfile?`<span class="legend-item"><span class="legend-swatch ref"></span>${esc(compareProfile.name)}（参考点）</span>`:''}`;
  if(mode!=='intensity')return base;
  return `${base}<span class="legend-item"><span class="legend-dot left"></span>偏 0 端 (≤35)</span><span class="legend-item"><span class="legend-dot mid"></span>中间 (35–65)</span><span class="legend-item"><span class="legend-dot right"></span>偏 100 端 (≥65)</span>`;
}

function radarCardMarkup(r, compareProfile){
  const cfg=RADAR_MODES[radarMode]||RADAR_MODES.standard;
  return `<div class="radar-head">
      <h3>十维立场图谱</h3>
      <select id="radar-compare" class="radar-select" aria-label="选择要对照的参考画像">
        <option value="none" ${radarCompareId==='none'?'selected':''}>不叠加参考画像</option>
        ${IDEOLOGIES.map(p=>`<option value="${p.id}" ${radarCompareId===p.id?'selected':''}>对照：${esc(p.name)}</option>`).join('')}
      </select>
    </div>
    <div class="radar-mode-tabs" role="tablist" aria-label="切换图谱视角">
      ${Object.entries(RADAR_MODES).map(([key,m])=>`<button type="button" class="radar-mode-btn ${radarMode===key?'active':''}" data-radar-mode="${key}" role="tab" aria-selected="${radarMode===key}">${esc(m.label)}</button>`).join('')}
    </div>
    <div class="radar-mode-note" id="radar-mode-note">${esc(cfg.note)}</div>
    <div id="radar-svg-host">${reportRadarSvg(r.dimensions, compareProfile, radarMode)}</div>
    <div class="radar-legend" id="radar-legend">${radarLegendMarkup(compareProfile, radarMode)}</div>
    <div class="radar-readout" id="radar-readout">${esc(cfg.readoutHint)}</div>`;
}

function renderReport(){
  const r=score(answers,bank), profiles=r.profiles.filter(p=>p.triggered), ranked=rankedIdeologies(r);
  const closest=closestIdeology(r);
  if(radarCompareId===null){
    radarCompareId=closest.id || ranked[0]?.id || 'none';
  }
  const compareProfile=IDEOLOGIES.find(p=>p.id===radarCompareId) || null;
  const extremeCount=r.dimensions.filter(d=>d.band==='low'||d.band==='high').length;
  const mixedCount=r.dimensions.filter(d=>d.supplemental_offered>0||(d.counts.left>=2&&d.counts.right>=2)).length;
  const middleCount=r.dimensions.filter(d=>d.band==='middle').length;
  const shownDims=filteredDimensions(r.dimensions);

  main.innerHTML=`<div class="report">
    <p class="eyebrow">Your views, in perspective</p>
    <div class="report-top">
      <h1>你的立场，不止一面。</h1>
      <span class="pill">版本 ${esc(r.version)} · 探索版</span>
    </div>
    <p class="muted">这里呈现的是你对本组题目的回答方向。请把它当作一次梳理自身取舍与关注点的起点。</p>

    <div class="report-stats-strip">
      <div class="stat-tile"><strong>${r.scored_answers} <small class="fine">/ 80</small></strong><span>基础核心题有效作答</span></div>
      <div class="stat-tile"><strong>${r.supplemental_answers} <small class="fine">/ ${r.supplemental_offered}</small></strong><span>按需补充题有效作答</span></div>
      <div class="stat-tile"><strong>${extremeCount} <small class="fine">/ 10</small></strong><span>明显偏向维度 (≤35 或 ≥65)</span></div>
      <div class="stat-tile"><strong>${mixedCount} <small class="fine">/ 10</small></strong><span>双向分布 / 已补充维度</span></div>
    </div>

    <div class="notice-box">探索版，尚未经过真人样本校准。分数不是人口百分位、准确率或价值优劣。每个方面至少需要 6 道有效基础答案；低于门槛不显示分数。图中左右仅代表该维度的端点，不等于传统政治左右派。</div>

    <div class="report-hero-grid">
      ${closestMarkup(r, ranked)}
      <section class="radar-card" id="radar-card" aria-label="十维立场雷达图">${radarCardMarkup(r, compareProfile)}</section>
    </div>

    <section class="report-section" aria-label="十个维度的详细画像">
      <div class="report-section-head">
        <div>
          <h2>十个维度的画像</h2>
          <p class="fine">虚线空心点（如有）为补充题前的基础分，实心绿点为当前分数；底部色条按左向（陶土）、中立（灰绿）、右向（深绿）比例绘制。</p>
        </div>
      </div>
      <div class="filter-tabs" role="tablist" aria-label="筛选维度卡片">
        <button type="button" class="filter-tab ${reportFilter==='all'?'active':''}" data-filter="all">全部维度 (${r.dimensions.length})</button>
        <button type="button" class="filter-tab ${reportFilter==='extreme'?'active':''}" data-filter="extreme">明显偏向 (${extremeCount})</button>
        <button type="button" class="filter-tab ${reportFilter==='middle'?'active':''}" data-filter="middle">中间区域 (${middleCount})</button>
        <button type="button" class="filter-tab ${reportFilter==='mixed'?'active':''}" data-filter="mixed">双向 / 已补充 (${mixedCount})</button>
      </div>
      <div class="dimensions-grid" id="dimensions-grid">
        ${shownDims.length?shownDims.map(dimensionCardMarkup).join(''):'<div class="notice-box">当前筛选条件下没有维度，请切换上方标签查看。</div>'}
      </div>
      <p class="fine">≤35 与 ≥65 仅是首版解释阈值，未经实证校准。中间分数可能来自中立，也可能来自不同议题方向相反；小幅分差不宜作实质解释。</p>
    </section>

    <section class="report-section">
      <h2>情境中的取舍</h2>
      <p class="muted">条件变化时改变选择很正常。这部分单独呈现，不改变维度分数，也不估计因果效应。</p>
      <div class="scenario-grid">
        ${r.scenario_pairs.map(p=>`<article class="scenario-card">
          <div class="scenario-card-head">
            <h3>${esc(p.theme)}</h3>
            <span class="pill ${p.status==='条件变化后选择不同'?'amber':'subtle'}">${esc(p.status)}</span>
          </div>
          ${p.ids.map(id=>{const s=r.scenarios.find(x=>x.id===id);return `<div class="scenario-item"><div class="scenario-q"><strong>${id}</strong> · ${esc(questions[id].text)}</div><div class="scenario-a">${esc(s.text??'未作答')}</div></div>`;}).join('')}
        </article>`).join('')}
      </div>
    </section>

    <section class="report-section">
      <h2>与思想传统的对照</h2>
      <p class="muted">一些观点可能与以下传统局部相近。提示可以并存，不是匹配概率、排名或唯一身份。</p>
      ${profiles.length?`<div class="profiles-grid">${profiles.map(p=>`<article class="profile-card"><h3>${esc(p.name)}</h3><p><strong>支持线索：</strong>${p.supporting.map(id=>{const d=r.dimensions.find(d=>d.id===id);return `${esc(d.name)}（${d.score.toFixed(1)}）`;}).join('、')}。</p><p>${esc(p.caveat)}</p></article>`).join('')}</div>`:'<div class="notice-box">尚未触发预设组合提示，或所需信息不足。请优先使用多维画像理解自己；这不表示排除某种思想传统。</div>'}
      <p class="fine">规则不是完整思想谱系。未出现某条提示，不表示你不属于该传统。</p>
    </section>

    <section class="report-section">
      <h2>本次作答状态</h2>
      <div class="feedback-grid">
        ${r.feedback.map(f=>`<div class="feedback-card"><span class="muted">${esc(f.question)}</span><strong>${esc(f.text??'未作答')}</strong></div>`).join('')}
      </div>
      <p class="fine">这些自述不改变政治分数，不用于判断诚实程度。没有估计个人测量误差、统计置信区间或人口排名。</p>
    </section>

    <section class="report-actions">
      <div class="actions">
        <button type="button" class="button" id="report-export">下载结果报告 (Markdown)</button>
        <button type="button" class="button secondary" id="answer-export">导出原始答案 (JSON)</button>
        <button type="button" class="button secondary" id="edit-answers">返回修改答案</button>
        <button type="button" class="button secondary" id="print-report">打印 / 保存 PDF</button>
      </div>
      ${rememberMarkup()}
      <button type="button" class="text-button" id="reset">清除本次答案并重新开始</button>
    </section>
  </div>`;

  applyDynamicStyles();

  // Radar comparison & mode interactions (in-place update to preserve scroll position)
  const updateRadarCard=()=>{
    const card=$('#radar-card');
    const comp=IDEOLOGIES.find(p=>p.id===radarCompareId)||null;
    card.innerHTML=radarCardMarkup(r, comp);
    document.querySelectorAll('[data-compare-id]').forEach(btn=>btn.classList.toggle('active',btn.dataset.compareId===radarCompareId));
    bindRadarEvents();
  };

  const bindRadarEvents=()=>{
    const host=$('#radar-svg-host');
    const readout=$('#radar-readout');
    const comp=IDEOLOGIES.find(p=>p.id===radarCompareId)||null;
    const showDim=idx=>{
      const d=r.dimensions[idx];
      if(!d)return;
      host.querySelectorAll('[data-dim-index]').forEach(el=>el.classList.toggle('is-selected',Number(el.dataset.dimIndex)===idx));
      const cfg=RADAR_MODES[radarMode]||RADAR_MODES.standard;
      const axisName=cfg.axisLabel(d,idx);
      const userStr=d.score===null?'信息不足':`${d.score.toFixed(1)} 分`;
      const lean=d.score===null?'':d.score<=35?`（偏向：${d.low}）`:d.score>=65?`（偏向：${d.high}）`:'（中间区域）';
      if(radarMode==='autonomy' && idx<2){
        const plotted=d.score===null?'—':(100-d.score).toFixed(1);
        const refPlot=comp?(100-comp.point[idx]):null;
        const refStr=comp?` ｜ ${comp.name}图上 ${refPlot}（原参考点 ${comp.point[idx]}）`:'';
        readout.textContent=`${axisName}：图上位置 ${plotted}（= 100 − ${d.name}原得分 ${userStr}${lean}）${refStr}`;
      }else if(radarMode==='intensity'){
        const amp=d.score===null?'—':(Math.abs(d.score-50)*2).toFixed(1);
        const refAmp=comp?(Math.abs(comp.point[idx]-50)*2).toFixed(0):null;
        const refStr=comp?` ｜ ${comp.name}鲜明度 ${refAmp}%（原参考点 ${comp.point[idx]}）`:'';
        readout.textContent=`${d.name}：鲜明度 ${amp}%（真实得分 ${userStr}${lean}）${refStr}`;
      }else{
        const refStr=comp?` ｜ ${comp.name}参考点：${comp.point[idx]}`:'';
        readout.textContent=`${d.name}：${userStr}${lean}${refStr}`;
      }
    };
    host.querySelectorAll('[data-dim-index]').forEach(el=>{
      const idx=Number(el.dataset.dimIndex);
      el.addEventListener('mouseenter',()=>showDim(idx));
      el.addEventListener('focus',()=>showDim(idx));
      el.addEventListener('click',()=>showDim(idx));
    });
    $('#radar-compare')?.addEventListener('change',e=>{
      radarCompareId=e.target.value;
      updateRadarCard();
    });
    document.querySelectorAll('[data-radar-mode]').forEach(btn=>btn.addEventListener('click',()=>{
      radarMode=btn.dataset.radarMode;
      updateRadarCard();
    }));
  };
  bindRadarEvents();

  document.querySelectorAll('[data-compare-id]').forEach(btn=>btn.addEventListener('click',()=>{
    radarCompareId=btn.dataset.compareId;
    updateRadarCard();
  }));
  document.querySelectorAll('.filter-tab').forEach(btn=>btn.addEventListener('click',()=>{
    reportFilter=btn.dataset.filter;
    document.querySelectorAll('.filter-tab').forEach(t=>t.classList.toggle('active',t.dataset.filter===reportFilter));
    const list=filteredDimensions(r.dimensions);
    $('#dimensions-grid').innerHTML=list.length?list.map(dimensionCardMarkup).join(''):'<div class="notice-box">当前筛选条件下没有维度，请切换上方标签查看。</div>';
    applyDynamicStyles();
  }));

  $('#report-export').onclick=()=>download('political-values-report.md',markdownReport(r),'text/markdown;charset=utf-8');
  $('#answer-export').onclick=exportAnswers;
  $('#edit-answers').onclick=()=>{go('quiz',page);openOverview();};
  $('#print-report').onclick=()=>{document.querySelectorAll('details').forEach(d=>d.open=true);window.print();};
  $('#reset').onclick=confirmReset;
  bindRemember();
}

/* ---------- 24 Reference Profiles Explorer Modal ---------- */
function openProfilesModal(){
  const families=['全部',...new Set(IDEOLOGIES.map(p=>p.family))];
  let selectedFamily='全部';
  const dimShort=['分配','管理','权利','监督','参与','传统','文化','国际','安全','环境'];

  const renderBody=()=>{
    const list=selectedFamily==='全部'?IDEOLOGIES:IDEOLOGIES.filter(p=>p.family===selectedFamily);
    return `<p>系统内置 <strong>${IDEOLOGIES.length}</strong> 种参考画像，仅作十维坐标对照，不是完整思想谱系或身份认定。<a href="docs/最贴近意识形态规则.html" target="_blank" rel="noopener">阅读完整归纳规则 ↗</a></p>
      <div class="filter-tabs" role="tablist" aria-label="按思想类别筛选">
        ${families.map(f=>`<button type="button" class="filter-tab ${selectedFamily===f?'active':''}" data-family="${esc(f)}">${esc(f)}</button>`).join('')}
      </div>
      <div class="catalog-grid">
        ${list.map(p=>`<article class="catalog-card">
          <span class="pill subtle">${esc(p.family)}</span>
          <h3>${esc(p.name)}</h3>
          <p>${esc(p.description)}</p>
          <p class="fine">边界：${esc(p.limitation)}</p>
          <div class="catalog-bars" aria-label="十维参考坐标">${p.point.map((v,i)=>`<div class="catalog-bar-col" title="${dimShort[i]}: ${v}"><div class="catalog-bar-fill" data-height="${Math.max(8,v)}"></div></div>`).join('')}</div>
        </article>`).join('')}
      </div>`;
  };

  showModal('24 种参考画像图谱', renderBody(), true);
  applyDynamicStyles();
  content.onclick=e=>{
    const tab=e.target.closest('[data-family]');
    if(!tab)return;
    selectedFamily=tab.dataset.family;
    content.innerHTML=`<h2 id="modal-title">24 种参考画像图谱</h2>${renderBody()}`;
    applyDynamicStyles();
  };
}

/* ---------- Import / Export / Reset / About ---------- */
function download(name,text,type){
  const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('已发起下载，请查看浏览器下载列表。');
}
function exportAnswers(){
  download('political-values-v2-answers.json',JSON.stringify(answerEnvelope(answers,bank),null,2)+'\n','application/json');
}
function openImport(){
  showModal('导入已有答案',`<p>选择本网站新版导出的JSON。v2.0答案可以直接导入，澄清题留空。v1旧版答案请到<a href="legacy/v1/">旧版问卷</a>使用；新版改写了题目，不会直接套用旧答案。导入后会<strong>替换本页现有答案</strong>；文件仅在浏览器中读取，不会上传。</p>
    <label for="answer-file">选择答案文件</label><br><input id="answer-file" type="file" accept=".json,application/json">
    <p><label for="answer-text">或粘贴答案 JSON</label></p>
    <textarea id="answer-text" placeholder='粘贴包含 format、version 和 answers 的新版答案文件' spellcheck="false"></textarea>
    <p id="import-error" class="error" role="alert"></p>
    <button type="button" class="button" id="confirm-import">导入并替换当前答案</button>`);
  $('#answer-file').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    try{if(file.size>100000)throw new Error('文件过大，请选择原始答案JSON。');$('#answer-text').value=await file.text();$('#import-error').textContent='';}
    catch(err){$('#import-error').textContent=err.message;}
  };
  $('#confirm-import').onclick=()=>{
    try{
      const imported=parseAnswers($('#answer-text').value,bank);
      answers=Object.fromEntries(Object.entries(imported).filter(([,v])=>v!==null));
      page=0;radarCompareId=null;syncPages();modal.close();go('quiz',0);
      toast(`已导入 ${count()} 道题的答案。`);
    }catch(err){$('#import-error').textContent=err.message;}
  };
}

function confirmReset(){
  showModal('清除本次答案',`<p>这会清除当前页面的答案及此网站在本浏览器保存的进度。已经下载的文件不会被删除。清除后无法从本页恢复。</p>
    <div class="actions"><button type="button" class="button secondary" id="backup">先导出答案</button><button type="button" class="button danger" id="confirm-reset">确认清除并重新开始</button></div>`);
  $('#backup').onclick=exportAnswers;
  $('#confirm-reset').onclick=()=>{
    try{localStorage.removeItem(KEY);answers={};remember=false;saveError='';page=0;radarCompareId=null;modal.close();go('home');toast('本次答案和本地进度已清除。');}
    catch{toast('无法清除本地存档，请使用浏览器的网站数据设置。');}
  };
}

function openAbout(){
  showModal('方法与隐私',`<p><strong>96道基础题，按需增加0–40道补充题及10道澄清题，分为10个方面。</strong>80道基础立场题按方面分别计分。某个方面的基础答案差异较大时，会增加4道补充题。初步画像接近中间时，10道澄清题帮助区分折中、混合和不确定，不改变分数。12道情境题与4道反馈不计分。每个方面至少需要6道有效基础答案；中立、未知、题意不清和跳过分别处理。</p>
    <p><strong>原创探索版，未经实证校准。</strong>已检查计分逻辑，但尚未开展真人访谈、信度效度验证或跨文化等值性研究。维度可能需要拆分。结果不用于招聘、资格筛选或判断他人是否可信。</p>
    <p><strong>答案不上传。</strong>本网站没有后端、账号、广告、统计追踪或外部字体。计分在本地完成。只有主动勾选后，答案才保存在此浏览器的网站存储中；可以取消保存或清除答案。导出文件由你保管。GitHub Pages作为托管服务仍可能记录访问请求的IP等常规日志，答案不会包含在请求或网址中。</p>
    <p>HTTP与HTTPS、不同域名和不同浏览器的本地存储彼此独立。跨设备继续请自行导出并导入。不要在共用设备保存敏感答案。</p>
    <ul>
      <li><a href="docs/计分与解释规范.html" target="_blank" rel="noopener">计分与思想传统规则</a></li>
      <li><a href="docs/最贴近意识形态规则.html" target="_blank" rel="noopener">查看${IDEOLOGIES.length}种参考画像与归纳方法</a></li>
      <li><a href="docs/覆盖矩阵与内容审查.html" target="_blank" rel="noopener">题目覆盖与已知问题</a></li>
      <li><a href="docs/真人试测与校准方案.html" target="_blank" rel="noopener">真人试测与校准方案</a></li>
      <li><a href="questionnaire-v2.zip" download>下载新版问卷及完整文档</a></li>
    </ul>
    <p class="fine">问卷版本：${esc(bank.version)}。先按十维距离寻找参考画像，再核实中间主义所需证据，从${IDEOLOGIES.length}种参考画像中比较，归纳版本${CLASSIFIER_VERSION}；思想传统提示不代表唯一身份。</p>`);
}

async function init(){
  try{
    const response=await fetch('./data.json');if(!response.ok)throw new Error(`题库加载失败（${response.status}）`);bank=await response.json();
    questions=Object.fromEntries([...bank.items,...bank.scenarios,...bank.feedback,...CLARIFICATIONS].map(q=>[q.id,q]));
    syncPages();
    try{
      const raw=localStorage.getItem(KEY);
      if(raw){
        const saved=JSON.parse(raw);
        if(![bank.version,'2.0.0-exploratory'].includes(saved.version))throw new Error('version');
        validateAnswers(saved.answers,bank);
        answers=Object.fromEntries(Object.entries(saved.answers).filter(([,v])=>v!==null));
        syncPages();
        page=Number.isInteger(saved.page)&&saved.page>=0&&saved.page<pages.length?saved.page:0;
        remember=true;
      }
    }catch{saveError='本地进度无法读取或版本不匹配。旧数据未自动删除，请先备份已有答案。';}
    try{legacyAvailable=!!localStorage.getItem('political-values-v1-local');}catch{}
    $('#about-button').onclick=openAbout;
    $('#profiles-button').onclick=openProfilesModal;
    $('.brand').onclick=e=>{e.preventDefault();go('home');};
    renderHome();
  }catch(err){
    main.innerHTML=`<div class="loading"><h1>问卷暂时无法载入</h1><p>${esc(err.message)}</p><button type="button" class="button" id="retry">重新加载</button><p><a href="docs/问卷.html">使用文字版问卷</a></p></div>`;
    $('#retry').onclick=()=>location.reload();
  }
}
init();
