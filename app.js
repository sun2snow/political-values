import {CLARIFICATIONS} from './clarification.mjs';
import {questionnairePages} from './flow.mjs';
import {closestIdeology,clarificationSummary,IDEOLOGIES,CLASSIFIER_VERSION} from './ideology.mjs';
import {validateAnswers, parseAnswers, score, describeDimension, markdownReport, exportAnswers as answerEnvelope} from './core.mjs';
const $=s=>document.querySelector(s);
const main=$('#main'), modal=$('#modal'), content=$('#modal-content');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY='political-values-v2-local';
let bank, pages, questions, answers={}, page=0, view='home', remember=false, saveError='', legacyAvailable=false, toastTimer;
const coreOptions={'1':'非常不同意','2':'比较不同意','3':'既不赞同也不反对','4':'比较同意','5':'非常同意','U':'不了解／无法判断','Q':'题意不清'};
const activeIds=()=>pages.flatMap(p=>p.ids);
const count=()=>activeIds().filter(id=>answers[id]!=null).length;
const total=()=>activeIds().length;
function syncPages(){const current=pages?.[page]?.id;pages=questionnairePages(answers,bank);const index=pages.findIndex(p=>p.id===current);page=index>=0?index:Math.min(page,pages.length-1);}
const pageCount=p=>p.ids.filter(id=>answers[id]!==undefined && answers[id]!==null).length;
function toast(text){$('#notice').textContent=text;$('#notice').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#notice').classList.remove('visible'),4000);}
function showModal(title, body){content.innerHTML=`<h2 id="modal-title">${title}</h2>${body}`;if(!modal.open)modal.showModal();}
function persist(){
  if(!remember)return;
  try {localStorage.setItem(KEY,JSON.stringify({version:bank.version,answers,page,view}));saveError='';}
  catch {saveError='此浏览器无法保存进度。请导出答案，关闭页面前自行保留。';toast(saveError);}
}
function setRemember(value){
  remember=value;
  if(value)persist();
  else {try{localStorage.removeItem(KEY);saveError='';}catch{saveError='无法移除本地存档，请使用浏览器网站数据设置清除。';toast(saveError);}}
  const status=$('#save-status');if(status)status.textContent=saveStatus();
}
function saveStatus(){return saveError || (remember?'进度保存在此浏览器中':'当前仅在本页保留，刷新后会丢失');}
function rememberMarkup(){return `<label class="local-option"><input id="remember" type="checkbox" ${remember?'checked':''}><span>在此浏览器保存进度<span class="fine">（共用设备建议关闭）</span></span></label><p id="save-status" class="fine ${saveError?'save-warning':''}">${esc(saveStatus())}</p>`;}
function bindRemember(){$('#remember')?.addEventListener('change',e=>setRemember(e.target.checked));}
function focusMain(){main.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
function go(next,nextPage=page){syncPages();view=next;page=Math.max(0,Math.min(pages.length-1,nextPage));persist();render();focusMain();}
function render(){if(view==='quiz')renderQuiz();else if(view==='report')renderReport();else renderHome();}
function homeGraphic(){return `<aside class="hero-card" aria-label="多维画像示意图，示意位置不是你的结果"><div class="card-label">MORE THAN LEFT & RIGHT</div><h2>你的观点，<br>可以不在同一条线上。</h2>${[['市场配置','公共规划',30],['集中裁量','权力制衡',74],['文化延续','个人自主',58],['当期增长','代际责任',84]].map(([l,r,p])=>`<div class="mini-row"><div class="mini-label"><span>${l}</span><span>${r}</span></div><div class="mini-axis" data-position="${p}"></div></div>`).join('')}<small>维度示意 · 非个人结果 · 不作优劣判断</small></aside>`;}
function renderHome(){
  main.innerHTML=`<section class="hero"><div><p class="eyebrow">A map of your political values</p><h1>理解立场，<br>从看见<em>取舍</em>开始。</h1><p class="lead">关于公平、自由、传统与共同生活，你如何作出选择？从十个视角探索政治价值，认识那些无法用一个标签概括的自己。</p><div class="metrics"><div class="metric"><strong>96<span class="metric-plus"> + 0–50</span></strong><span>道基础题 · 按需补充</span></div><div class="metric"><strong>10</strong><span>个独立呈现的维度</span></div><div class="metric"><strong>25–35</strong><span>分钟 · 按需题另需约0–20分钟</span></div></div><div class="actions"><button class="button" id="start">${count()?'继续作答':'开始探索'} <span aria-hidden="true">↗</span></button><button class="text-button" id="import-home">导入已有答案</button></div>${rememberMarkup()}${legacyAvailable?'<p class="notice-box">检测到旧版进度。新版题目已改写，旧答案不会自动套用。<a href="legacy/v1/">继续旧版问卷 ↗</a></p>':''}${count()?`<p class="fine">已有 ${count()} / ${total()} 题答案。<button class="text-button" id="existing-result">查看当前结果</button></p>`:''}</div>${homeGraphic()}</section><section class="intro-bottom" aria-label="测试说明"><div class="intro-feature"><span class="number">01 / 多维，而非单一标签</span><h3>保留复杂，也保留不同</h3><p>经济、文化与制度观点分别呈现。混合立场很正常，不需要为了“保持一致”改变答案。</p></div><div class="intro-feature"><span class="number">02 / 答案留在你的设备</span><h3>由你决定保存与分享</h3><p>答案只在浏览器中计分，不上传、不设账号、不使用分析追踪。保存进度需要主动勾选。</p></div><div class="intro-feature"><span class="number">03 / 坦诚面对测量边界</span><h3>一份探索性的问卷</h3><p>问卷尚未经真人样本校准。结果用于自我理解，不是诊断、人口排名或政治身份认定。</p></div></section><div class="load-tools"><div class="notice-box">请按自己的看法作答，没有标准答案。可以跳题、暂停或修改。“中立”与“无法判断”是不同的选择。基础题完成后，如果某个方面的选择差别较大，会增加4道可跳过的补充题。初步画像接近中间时，另有10道可跳过的澄清题，不改变分数。预计用时尚待真人试测。</div><a href="questionnaire-v2.zip" download>下载新版问卷与方法文档 ↗</a> · <a href="legacy/v1/">使用旧版问卷</a></div>`;
  document.querySelectorAll('[data-position]').forEach(el=>el.style.setProperty('--position',el.dataset.position+'%'));
  $('#start').onclick=()=>go('quiz',count()?page:0);
  $('#import-home').onclick=openImport;
  $('#existing-result')?.addEventListener('click',confirmReport);
  bindRemember();
}
function questionMarkup(id,index){
  const q=questions[id],isCore=!!q.dimension,isScene=!!q.theme,options=isCore?coreOptions:q.options;
  const choices=Object.entries(options).map(([key,label])=>{
    const value=isCore||!isScene ? (/^[1-5]$/.test(key)?Number(key):key):key;
    return {key,html:`<label class="option"><input type="radio" name="${id}" value="${key}" ${answers[id]===value?'checked':''}><span>${isScene?`<span class="option-letter" aria-hidden="true">${key}</span>`:''}${esc(label)}</span></label>`};
  });
  const primary=choices.filter(c=>!isCore || /^[1-5]$/.test(c.key)).map(c=>c.html).join('');
  const extra=choices.filter(c=>isCore&&!/^[1-5]$/.test(c.key)).map(c=>c.html).join('');
  return `<fieldset class="question ${isScene?'scenario':isCore?'':'feedback'}"><legend><span class="q-number">${q.status==='clarification'?'澄清':q.status==='supplemental'?'补充':String(index+1).padStart(2,'0')+' / 96'} · ${id}</span>${esc(q.text)}</legend>${q.help?`<p class="question-help">${esc(q.help)}</p>`:''}<div class="options">${primary}</div><div class="extra-options">${extra}<button type="button" class="clear-answer" data-clear="${id}" aria-label="清空${['supplemental','clarification'].includes(q.status)?id:'第'+(index+1)+'题'}的选择">清空选择 / 跳过</button></div></fieldset>`;
}
function renderQuiz(){
  const p=pages[page];
  main.innerHTML=`<div class="quiz-shell"><div class="quiz-top"><div class="quiz-meta"><span id="progress-label">已选择 ${count()} / ${total()} 题</span><button class="text-button" id="overview">题目导航 · 第 ${page+1} / ${pages.length} 页</button></div><div class="progress" role="progressbar" aria-label="已选择题目数" aria-valuemin="0" aria-valuemax="${total()}" aria-valuenow="${count()}"><div class="progress-fill"></div></div></div><div class="section-heading"><p class="eyebrow">${p.type==='supplemental'?'A CLOSER LOOK':p.type==='core'?'YOUR VALUES':p.type==='scenario'?'VALUES IN CONTEXT':'ABOUT THIS SESSION'}</p><h1>${p.title}</h1><p>${p.description}</p></div>${page>0&&[2,4,6,8].includes(page)?'<div class="rest">可以在这里稍作休息。你的观点无需与其他题目保持表面一致。</div>':''}<div id="questions">${p.ids.map(id=>questionMarkup(id,activeIds().indexOf(id))).join('')}</div><div class="quiz-nav"><button class="button secondary" id="previous">${page===0?'返回首页':'上一页'}</button><span class="fine">所有题目均可跳过</span><button class="button" id="next">${page===pages.length-1?'查看我的画像':'下一页 →'}</button></div>${rememberMarkup()}<div class="actions"><button class="text-button" id="export-progress">导出答案</button><button class="text-button" id="preview-result">${p.type==='clarification'?'跳过剩余澄清题，查看结果':p.type==='supplemental'?'跳过剩余补充题，查看结果':'查看当前结果'}</button></div></div>`;
  $('.progress-fill').style.width=(count()/total()*100)+'%';
  $('#questions').addEventListener('change',e=>{
    const el=e.target;if(el.type!=='radio')return;
    answers[el.name]=/^[1-5]$/.test(el.value)?Number(el.value):el.value;syncPages();persist();updateProgress();
  });
  $('#questions').addEventListener('click',e=>{
    const button=e.target.closest('[data-clear]');if(!button)return;
    delete answers[button.dataset.clear];
    button.closest('fieldset').querySelectorAll('input').forEach(i=>i.checked=false);
    syncPages();persist();updateProgress();toast('已清空这一题。');
  });
  $('#previous').onclick=()=>page===0?go('home'):go('quiz',page-1);
  $('#next').onclick=()=>page===pages.length-1?confirmReport():go('quiz',page+1);
  $('#overview').onclick=openOverview;
  $('#export-progress').onclick=exportAnswers;
  $('#preview-result').onclick=confirmReport;
  bindRemember();
}
function updateProgress(){
  $('.progress').setAttribute('aria-valuemax',total());
  $('#overview').textContent=`题目导航 · 第 ${page+1} / ${pages.length} 页`;
  $('#next').textContent=page===pages.length-1?'查看我的画像':'下一页 →';
  $('#progress-label').textContent=`已选择 ${count()} / ${total()} 题`;
  $('.progress').setAttribute('aria-valuenow',count());
  $('.progress-fill').style.width=(count()/total()*100)+'%';
  $('#save-status').textContent=saveStatus();
}
function openOverview(){
  showModal('题目导航',`<p>跳到任意页面修改答案。数字表示已选择题数，包含“无法判断”和“题意不清”。</p><div class="page-grid">${pages.map((p,i)=>`<button class="page-link ${i===page?'active':''}" data-page="${i}">${p.short}<span>${pageCount(p)} / ${p.ids.length} 题</span></button>`).join('')}</div><div class="actions"><button class="button secondary" id="nav-export">导出答案</button><button class="button secondary" id="nav-import">导入答案</button><button class="text-button" id="nav-home">返回首页</button></div>`);
  content.querySelectorAll('[data-page]').forEach(el=>el.onclick=()=>{modal.close();go('quiz',Number(el.dataset.page));});
  $('#nav-export').onclick=exportAnswers;$('#nav-import').onclick=openImport;$('#nav-home').onclick=()=>{modal.close();go('home');};
}
function confirmReport(){
  const result=score(answers,bank), insufficient=result.dimensions.filter(d=>d.score===null);
  const firstClarification=pages.findIndex(p=>p.type==='clarification'&&p.ids.some(id=>answers[id]==null));
  if(firstClarification>=0 && !(view==='quiz'&&pages[page].type==='clarification')){go('quiz',firstClarification);return;}
  const missing=total()-count();
  if(!missing&&!insufficient.length){go('report');return;}
  showModal('按当前答案生成画像',`<p>当前已选择 <strong>${count()} / ${total()}</strong> 题；可计分核心答案 <strong>${result.scored_answers} / 80</strong> 题。</p><p>${insufficient.length?`${insufficient.length} 个维度不足6道有效答案，将显示“信息不足”。`:'全部维度已达到最低计分门槛。'} “无法判断”和“题意不清”不计入分数。</p><p>已回答 ${result.supplemental_answers} / ${result.supplemental_offered} 道补充题。补充题可以跳过。</p><p>澄清题也可以跳过；没有足够证据时，不会把平均分接近中间直接认定为中间主义。可以先查看结果，之后仍可修改。</p><div class="actions"><button class="button" id="confirm-report">查看当前画像</button><button class="button secondary" id="fill-missing">继续补充答案</button></div>`);
  $('#confirm-report').onclick=()=>{modal.close();go('report');};
  $('#fill-missing').onclick=()=>{modal.close();const first=pages.findIndex(p=>p.ids.some(id=>answers[id]==null || ['U','Q'].includes(answers[id])));go('quiz',first<0?page:first);};
}
function closestMarkup(result){
  const c=closestIdeology(result);
  if(c.status==='insufficient')return `<section class="ideology-summary" aria-labelledby="ideology-heading"><p class="eyebrow">YOUR CLOSEST TRADITION</p><h2 id="ideology-heading">最贴近的意识形态</h2><p>${esc(c.explanation)}</p></section>`;
  const clarificationHtml=clarificationSummary(result,c).map(t=>`<p class="fine">${esc(t)}</p>`).join('');
  if(c.status!=='matched')return `<section class="ideology-summary" aria-labelledby="ideology-heading"><p class="eyebrow">YOUR VIEWS IN CONTEXT</p><h2 id="ideology-heading">${esc(c.name)}</h2><p>${esc(c.description)}</p>${c.caveats.map(t=>`<p class="fine">${esc(t)}</p>`).join('')}${clarificationHtml}<a class="fine" href="docs/最贴近意识形态规则.html" target="_blank" rel="noopener">查看归纳方法与全部参考画像 ↗</a></section>`;
  return `<section class="ideology-summary" aria-labelledby="ideology-heading"><p class="eyebrow">YOUR CLOSEST TRADITION</p><span class="fine">最贴近的意识形态 · 参考性总结</span><h2 id="ideology-heading">${esc(c.name)}</h2><p>${esc(c.description)}</p><p class="fine">参考类别：${esc(c.family)}。解释边界：${esc(c.limitation)}</p><p class="fine">较接近的维度：${c.supporting.map(d=>`${esc(d.name)} ${d.score.toFixed(1)}（参考点 ${d.target}）`).join('、')}。</p><p class="fine">${c.contrasts.length?'主要差异：'+c.contrasts.map(d=>`${esc(d.name)} ${d.score.toFixed(1)}，参考点为 ${d.target}`).join('；')+'。':'没有维度与参考点相差20分或以上；这不表示所有具体观点都一致。'}</p>${c.caveats.map(t=>`<p class="fine">${esc(t)}</p>`).join('')}${clarificationHtml}<a class="fine" href="docs/最贴近意识形态规则.html" target="_blank" rel="noopener">查看归纳方法与全部参考画像 ↗</a></section>`;
}
function renderReport(){
  const r=score(answers,bank), profiles=r.profiles.filter(p=>p.triggered);
  main.innerHTML=`<div class="report"><p class="eyebrow">Your views, in perspective</p><div class="report-top"><h1>你的立场，不止一面。</h1><span class="pill">${r.scored_answers} / 80 基础题有效 · ${r.supplemental_answers} / ${r.supplemental_offered} 补充题有效</span></div><p class="muted">这里呈现的是你对本组题目的回答方向。请把它当作一次整理观点的起点。</p><div class="notice-box">探索版，尚未实证校准。分数不是人口百分位、准确率或价值优劣。每个方面至少6道有效基础答案；低于门槛不显示分数。图中左右仅代表该维度的端点，不等于传统政治左右派。</div>${closestMarkup(r)}<details class="dimension-details" open><summary>查看十个维度的画像</summary><section aria-label="十个维度的结果">${r.dimensions.map(d=>`<article class="dimension"><div class="dimension-head"><h3>${esc(d.name)}</h3><span class="score">${d.score===null?'信息不足':d.score.toFixed(1)} <small>${d.score===null?'':'/ 100'}</small></span></div><div class="axis-labels"><span>${esc(d.low)}</span><span>${esc(d.high)}</span></div><div class="axis ${d.score===null?'missing':''}" aria-hidden="true">${d.score===null?'':`<span class="axis-dot" data-score="${d.score}"></span>`}</div><p>${esc(describeDimension(d))}</p>${d.supplemental_offered?`<p class="supplement-note">基础分 ${d.base_score}；已回答 ${d.supplemental_answered}/${d.supplemental_offered} 道补充题。当前分数包含这些补充答案。补充题不会保证分数更准确。</p>`:''}<div class="counts">有效 ${d.answered}/${d.total_items} · 左向 ${d.counts.left} · 中立 ${d.counts.neutral} · 右向 ${d.counts.right}<br>无法判断 ${d.counts.unknown} · 题意不清 ${d.counts.unclear} · 跳过 ${d.counts.skipped}</div></article>`).join('')}</section></details><p class="fine">≤35与≥65仅是首版解释阈值，未经实证校准。中间分数可能来自中立，也可能来自不同议题方向相反；小幅分差不宜作实质解释。</p><section class="report-section"><h2>情境中的取舍</h2><p class="muted">条件变化时改变选择很正常。这部分单独呈现，不改变维度分数，也不估计因果效应。</p>${r.scenario_pairs.map(p=>`<details><summary>${esc(p.theme)} · ${p.status}</summary>${p.ids.map(id=>{const s=r.scenarios.find(s=>s.id===id);return `<p><strong>${id}</strong> ${esc(questions[id].text)}</p><p>你的选择：${esc(s.text??'未作答')}</p>`;}).join('')}</details>`).join('')}</section><section class="report-section"><h2>与思想传统的对照</h2><p class="muted">一些观点可能与以下传统局部相近。提示可以并存，不是匹配概率、排名或唯一身份。</p>${profiles.length?profiles.map(p=>`<article class="profile-card"><h3>${esc(p.name)}</h3><p>支持线索：${p.supporting.map(id=>{const d=r.dimensions.find(d=>d.id===id);return `${esc(d.name)}（${d.score.toFixed(1)}）`;}).join('、')}。</p><p>${esc(p.caveat)}</p></article>`).join(''):'<div class="notice-box">尚未触发预设组合提示，或所需信息不足。请优先使用多维画像理解自己；这不表示排除某种思想传统。</div>'}<p class="fine">规则不是完整思想谱系。未出现某条提示，不表示你不属于该传统。</p></section><section class="report-section"><h2>本次作答状态</h2>${r.feedback.map(f=>`<p class="fine">${esc(f.question)} <strong>${esc(f.text??'未作答')}</strong></p>`).join('')}<p class="fine">这些自述不改变政治分数，不用于判断诚实程度。没有估计个人测量误差、统计置信区间或人口排名。</p></section><section class="report-actions"><div class="actions"><button class="button" id="report-export">下载结果报告</button><button class="button secondary" id="answer-export">导出原始答案</button><button class="button secondary" id="edit-answers">返回修改</button><button class="button secondary" id="print-report">打印 / 保存 PDF</button></div>${rememberMarkup()}<button class="text-button" id="reset">清除本次答案并重新开始</button></section></div>`;
  document.querySelectorAll('[data-score]').forEach(el=>el.style.left=el.dataset.score+'%');
  $('#report-export').onclick=()=>download('political-values-report.md',markdownReport(r),'text/markdown;charset=utf-8');
  $('#answer-export').onclick=exportAnswers;$('#edit-answers').onclick=()=>{go('quiz',page);openOverview();};
  $('#print-report').onclick=()=>{document.querySelectorAll('details').forEach(d=>d.open=true);window.print();};
  $('#reset').onclick=confirmReset;bindRemember();
}
function download(name,text,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已发起下载，请查看浏览器下载列表。');}
function exportAnswers(){download('political-values-v2-answers.json',JSON.stringify(answerEnvelope(answers,bank),null,2)+'\n','application/json');}
function openImport(){
  showModal('导入已有答案',`<p>选择本网站新版导出的JSON。v2.0答案可以直接导入，澄清题留空。v1旧版答案请到<a href="legacy/v1/">旧版问卷</a>使用；新版改写了题目，不会直接套用旧答案。导入后会<strong>替换本页现有答案</strong>；文件仅在浏览器中读取，不会上传。</p><label for="answer-file">选择答案文件</label><br><input id="answer-file" type="file" accept=".json,application/json"><p><label for="answer-text">或粘贴答案 JSON</label></p><textarea id="answer-text" placeholder='粘贴包含 format、version 和 answers 的新版答案文件' spellcheck="false"></textarea><p id="import-error" class="error" role="alert"></p><button class="button" id="confirm-import">导入并替换当前答案</button>`);
  $('#answer-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>100000)throw new Error('文件过大，请选择原始答案JSON。');$('#answer-text').value=await file.text();$('#import-error').textContent='';}catch(err){$('#import-error').textContent=err.message;}};
  $('#confirm-import').onclick=()=>{try{const imported=parseAnswers($('#answer-text').value,bank);answers=Object.fromEntries(Object.entries(imported).filter(([,v])=>v!==null));page=0;syncPages();modal.close();go('quiz',0);toast(`已导入 ${count()} 道题的答案。`);}catch(err){$('#import-error').textContent=err.message;}};
}
function confirmReset(){
  showModal('清除本次答案',`<p>这会清除当前页面的答案及此网站在本浏览器保存的进度。已经下载的文件不会被删除。清除后无法从本页恢复。</p><div class="actions"><button class="button secondary" id="backup">先导出答案</button><button class="button danger" id="confirm-reset">确认清除并重新开始</button></div>`);
  $('#backup').onclick=exportAnswers;
  $('#confirm-reset').onclick=()=>{try{localStorage.removeItem(KEY);answers={};remember=false;saveError='';page=0;modal.close();go('home');toast('本次答案和本地进度已清除。');}catch{toast('无法清除本地存档，请使用浏览器的网站数据设置。');}};
}
function openAbout(){
  showModal('方法与隐私',`<p><strong>96道基础题，按需增加0–40道补充题及10道澄清题，分为10个方面。</strong>80道基础立场题按方面分别计分。某个方面的基础答案差异较大时，会增加4道补充题。初步画像接近中间时，10道澄清题帮助区分折中、混合和不确定，不改变分数。12道情境题与4道反馈不计分。每个方面至少需要6道有效基础答案；中立、未知、题意不清和跳过分别处理。</p><p><strong>原创探索版，未经实证校准。</strong>已检查计分逻辑，但尚未开展真人访谈、信度效度验证或跨文化等值性研究。维度可能需要拆分。结果不用于招聘、资格筛选或判断他人是否可信。</p><p><strong>答案不上传。</strong>本网站没有后端、账号、广告、统计追踪或外部字体。计分在本地完成。只有主动勾选后，答案才保存在此浏览器的网站存储中；可以取消保存或清除答案。导出文件由你保管。GitHub Pages作为托管服务仍可能记录访问请求的IP等常规日志，答案不会包含在请求或网址中。</p><p>HTTP与HTTPS、不同域名和不同浏览器的本地存储彼此独立。跨设备继续请自行导出并导入。不要在共用设备保存敏感答案。</p><ul><li><a href="docs/计分与解释规范.html" target="_blank" rel="noopener">计分与思想传统规则</a></li><li><a href="docs/最贴近意识形态规则.html" target="_blank" rel="noopener">查看${IDEOLOGIES.length}种参考画像与归纳方法</a></li><li><a href="docs/覆盖矩阵与内容审查.html" target="_blank" rel="noopener">题目覆盖与已知问题</a></li><li><a href="docs/真人试测与校准方案.html" target="_blank" rel="noopener">真人试测与校准方案</a></li><li><a href="questionnaire-v2.zip" download>下载新版问卷及完整文档</a></li></ul><p class="fine">问卷版本：${esc(bank.version)}。先按十维距离寻找参考画像，再核实中间主义所需证据，从${IDEOLOGIES.length}种参考画像中比较，归纳版本${CLASSIFIER_VERSION}；思想传统提示不代表唯一身份。</p>`);
}
async function init(){
  try{
    const response=await fetch('./data.json');if(!response.ok)throw new Error(`题库加载失败（${response.status}）`);bank=await response.json();
    questions=Object.fromEntries([...bank.items,...bank.scenarios,...bank.feedback,...CLARIFICATIONS].map(q=>[q.id,q]));
    syncPages();
    try{const raw=localStorage.getItem(KEY);if(raw){const saved=JSON.parse(raw);if(![bank.version,'2.0.0-exploratory'].includes(saved.version))throw new Error('version');validateAnswers(saved.answers,bank);answers=Object.fromEntries(Object.entries(saved.answers).filter(([,v])=>v!==null));syncPages();page=Number.isInteger(saved.page)&&saved.page>=0&&saved.page<pages.length?saved.page:0;remember=true;}}
    catch{saveError='本地进度无法读取或版本不匹配。旧数据未自动删除，请先备份已有答案。';}
    try{legacyAvailable=!!localStorage.getItem('political-values-v1-local');}catch{}
    $('#about-button').onclick=openAbout;
    $('.brand').onclick=e=>{e.preventDefault();go('home');};
    renderHome();
  }catch(err){main.innerHTML=`<div class="loading"><h1>问卷暂时无法载入</h1><p>${esc(err.message)}</p><button class="button" id="retry">重新加载</button><p><a href="docs/问卷.html">使用文字版问卷</a></p></div>`;$('#retry').onclick=()=>location.reload();}
}
init();
