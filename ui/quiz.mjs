import {$, esc, coreOptions, applyDynamicStyles, rememberMarkup, toast} from './shared.mjs';

function questionStateMeta(q, val){
  if(val===undefined || val===null)return {cls:'',badgeCls:'',badgeText:'未作答'};
  if(val==='U' || val==='Q' || val==='unsure' || val==='unrepresented')
    return {cls:'is-uncertain',badgeCls:'uncertain',badgeText:q.dimension?coreOptions[val]:q.options[val]};
  const short=q.dimension?coreOptions[String(val)]:q.theme?`已选 ${val}`:q.options[String(val)];
  return {cls:'is-answered',badgeCls:'answered',badgeText:`已选：${short}`};
}

function questionMarkup(ctx, id, index){
  const q=ctx.questions[id], isCore=!!q.dimension, isScene=!!q.theme, isClarify=q.status==='clarification';
  const options=isCore?coreOptions:q.options;
  const val=ctx.answers[id];
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
  return `<fieldset class="question ${isScene?'scenario':isClarify?'clarification':isCore?'':'feedback'} ${state.cls} ${ctx.activeQid===id?'is-active':''}" id="q-wrap-${id}" data-qid="${id}" tabindex="-1">
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

function dotClass(ctx, id){
  const v=ctx.answers[id];
  const stateCls=v==null?'':(['U','Q','unsure','unrepresented'].includes(v)?'is-uncertain':'is-answered');
  const curCls=ctx.activeQid===id?'is-current':'';
  return `page-dot ${stateCls} ${curCls}`.trim();
}

function pageDotsMarkup(ctx, p){
  return p.ids.map((id,idx)=>`<button type="button" class="${dotClass(ctx,id)}" data-jump-q="${id}" title="跳到本页第 ${idx+1} 题">${idx+1}</button>`).join('');
}

function sectionBadgeText(p){
  if(p.type==='core')return `基础作答 · ${p.short}`;
  if(p.type==='scenario')return `情境取舍 · ${p.short}`;
  if(p.type==='feedback')return '作答反馈';
  return p.short;
}

export function setActiveQuestion(ctx, qid){
  if(ctx.activeQid===qid)return;
  if(ctx.activeQid)document.getElementById(`q-wrap-${ctx.activeQid}`)?.classList.remove('is-active');
  ctx.activeQid=qid;
  document.getElementById(`q-wrap-${qid}`)?.classList.add('is-active');
  document.querySelectorAll('#page-dots .page-dot').forEach(d=>d.classList.toggle('is-current',d.dataset.jumpQ===qid));
}

export function scrollToQuestion(ctx, qid){
  const el=document.getElementById(`q-wrap-${qid}`);
  if(!el)return;
  setActiveQuestion(ctx, qid);
  el.focus({preventScroll:true});
  const top=el.getBoundingClientRect().top+window.scrollY-132;
  window.scrollTo({top:Math.max(0,top),behavior:'smooth'});
}

function refreshQuestionUI(ctx, qid){
  const fs=document.getElementById(`q-wrap-${qid}`);
  if(!fs)return;
  const meta=questionStateMeta(ctx.questions[qid],ctx.answers[qid]);
  fs.classList.remove('is-answered','is-uncertain');
  if(meta.cls)fs.classList.add(meta.cls);
  const badge=fs.querySelector(`[data-badge="${qid}"]`);
  if(badge){badge.textContent=meta.badgeText;badge.className=`q-state-badge ${meta.badgeCls}`;}
}

function updateProgress(ctx){
  const p=ctx.pages[ctx.page], answered=ctx.count(), all=ctx.total(), pct=all?Math.round(answered/all*100):0;
  const bar=$('.progress');
  bar.setAttribute('aria-valuemax',all);
  bar.setAttribute('aria-valuenow',answered);
  $('.progress-fill').style.width=(all?(answered/all*100):0)+'%';
  $('#overview').textContent=`题目导航 · 第 ${ctx.page+1} / ${ctx.pages.length} 页`;
  $('#next').textContent=ctx.page===ctx.pages.length-1?'查看我的画像':'下一页 →';
  $('#progress-label').textContent=`已选择 ${answered} / ${all} 题 (${pct}%)`;
  // Update page-dot classes in-place to preserve keyboard focus
  document.querySelectorAll('#page-dots .page-dot').forEach(dot=>{
    dot.className=dotClass(ctx, dot.dataset.jumpQ);
  });
  const navFine=$('.quiz-nav .fine');
  if(navFine)navFine.textContent=`本页已答 ${ctx.pageCount(p)} / ${p.ids.length} · 所有题目均可跳过`;
  const jumpBtn=$('#jump-unanswered');
  if(jumpBtn)jumpBtn.hidden=!p.ids.some(id=>ctx.answers[id]==null);
  const status=$('#save-status');
  if(status)status.textContent=ctx.saveStatus();
}

export function renderQuiz(ctx){
  const p=ctx.pages[ctx.page];
  const answered=ctx.count(), all=ctx.total(), pct=all?Math.round(answered/all*100):0;
  const firstUnanswered=p.ids.find(id=>ctx.answers[id]==null);
  if(!ctx.activeQid || !p.ids.includes(ctx.activeQid))ctx.activeQid=p.ids[0];
  const ids=ctx.activeIds();
  const extraCallout=p.type==='supplemental'
    ? `<div class="notice-box">你在该维度的基础作答呈现出有意思的双向分布，以下 4 道补充题从不同情境继续了解你的看法。可全部或部分跳过，不会降低现有结论的效力。</div>`
    : p.type==='clarification'
    ? `<div class="notice-box amber">你的十维初步平均分接近中间区域。以下 10 题帮助区分「主张折中」「不同议题有不同取向」与「尚未确定」，<strong>不会改变任何十维分数</strong>，也可以跳过。</div>`
    : '';

  ctx.main.innerHTML=`<div class="quiz-shell">
    <div class="quiz-top">
      <div class="quiz-meta">
        <div class="quiz-meta-left">
          <span class="pill">${esc(sectionBadgeText(p))}</span>
          <span class="quiz-progress-text" id="progress-label">已选择 ${answered} / ${all} 题 (${pct}%)</span>
        </div>
        <div class="quiz-meta-right">
          <button type="button" class="text-button" id="jump-unanswered" ${firstUnanswered?'':'hidden'}>跳到未答题</button>
          <button type="button" class="text-button" id="overview">题目导航 · 第 ${ctx.page+1} / ${ctx.pages.length} 页</button>
        </div>
      </div>
      <div class="progress" role="progressbar" aria-label="已选择题目数" aria-valuemin="0" aria-valuemax="${all}" aria-valuenow="${answered}"><div class="progress-fill" data-width="${all?(answered/all*100).toFixed(2):0}"></div></div>
      <div class="page-dots" id="page-dots" aria-label="本页题目快速定位">${pageDotsMarkup(ctx,p)}</div>
    </div>
    <div class="section-heading">
      <p class="eyebrow">${p.type==='supplemental'?'A CLOSER LOOK':p.type==='core'?'YOUR VALUES':p.type==='scenario'?'VALUES IN CONTEXT':p.type==='clarification'?'CLARIFYING THE CENTER':'ABOUT THIS SESSION'}</p>
      <h1>${p.title}</h1>
      <p>${p.description}</p>
    </div>
    ${extraCallout}
    ${ctx.page>0&&[2,4,6,8].includes(ctx.page)?'<div class="rest">可以在这里稍作休息。你的观点无需与其他题目保持表面一致，按当下的真实想法作答即可。</div>':''}
    <div id="questions">${p.ids.map(id=>questionMarkup(ctx,id,ids.indexOf(id))).join('')}</div>
    <div class="quiz-nav">
      <button type="button" class="button secondary" id="previous">${ctx.page===0?'返回首页':'← 上一页'}</button>
      <span class="fine">本页已答 ${ctx.pageCount(p)} / ${p.ids.length} · 所有题目均可跳过</span>
      <button type="button" class="button" id="next">${ctx.page===ctx.pages.length-1?'查看我的画像':'下一页 →'}</button>
    </div>
    <div class="quiz-footer-tools">
      <div>${rememberMarkup(ctx.remember, ctx.saveStatus(), ctx.saveError)}</div>
      <div class="actions">
        <button type="button" class="text-button" id="export-progress">导出答案</button>
        <button type="button" class="text-button" id="preview-result">${p.type==='clarification'?'跳过剩余澄清题，查看结果':p.type==='supplemental'?'跳过剩余补充题，查看结果':'查看当前结果'}</button>
      </div>
    </div>
    <p class="kbd-hint">快捷键：聚焦题目后按 <kbd>1</kbd>–<kbd>5</kbd> 作答（立场题支持 <kbd>U</kbd> 无法判断、<kbd>Q</kbd> 题意不清，<kbd>Backspace</kbd> 清空），<kbd>J</kbd> / <kbd>K</kbd> 切换上/下一题。</p>
  </div>`;
  applyDynamicStyles();

  const qContainer=$('#questions');
  qContainer.addEventListener('focusin',e=>{
    const fs=e.target.closest('fieldset[data-qid]');
    if(fs)setActiveQuestion(ctx, fs.dataset.qid);
  });
  qContainer.addEventListener('click',e=>{
    const fs=e.target.closest('fieldset[data-qid]');
    if(fs)setActiveQuestion(ctx, fs.dataset.qid);
    const button=e.target.closest('[data-clear]');
    if(!button)return;
    const qid=button.dataset.clear;
    delete ctx.answers[qid];
    button.closest('fieldset').querySelectorAll('input').forEach(i=>i.checked=false);
    ctx.syncPages();ctx.persist();refreshQuestionUI(ctx,qid);updateProgress(ctx);
    toast('已清空这一题。');
  });
  qContainer.addEventListener('change',e=>{
    const el=e.target;if(el.type!=='radio')return;
    ctx.answers[el.name]=/^[1-5]$/.test(el.value)?Number(el.value):el.value;
    ctx.syncPages();ctx.persist();refreshQuestionUI(ctx,el.name);updateProgress(ctx);
  });

  $('#page-dots').addEventListener('click',e=>{
    const btn=e.target.closest('[data-jump-q]');
    if(btn)scrollToQuestion(ctx, btn.dataset.jumpQ);
  });
  $('#jump-unanswered')?.addEventListener('click',()=>{
    const target=ctx.pages[ctx.page].ids.find(id=>ctx.answers[id]==null);
    if(target)scrollToQuestion(ctx, target);
  });
  $('#previous').onclick=()=>ctx.page===0?ctx.go('home'):ctx.go('quiz',ctx.page-1);
  $('#next').onclick=()=>ctx.page===ctx.pages.length-1?ctx.confirmReport():ctx.go('quiz',ctx.page+1);
  $('#overview').onclick=ctx.openOverview;
  $('#export-progress').onclick=ctx.exportAnswers;
  $('#preview-result').onclick=ctx.confirmReport;
  ctx.bindRemember();
}

export function handleQuizKeydown(ctx, e){
  if(ctx.view!=='quiz' || $('#modal').open)return;
  const focus=document.activeElement;
  if(e.isComposing||focus?.isContentEditable||!focus?.closest('#questions fieldset[data-qid]'))return;
  const tag=focus.tagName;
  if(['INPUT','TEXTAREA','SELECT'].includes(tag) && focus.type!=='radio')return;
  if(e.metaKey || e.ctrlKey || e.altKey)return;
  const p=ctx.pages?.[ctx.page];
  if(!p || !ctx.activeQid || !p.ids.includes(ctx.activeQid))return;
  const key=e.key.toUpperCase();
  if(key==='J' || key==='K'){
    e.preventDefault();
    const cur=p.ids.indexOf(ctx.activeQid);
    const nextIdx=Math.max(0,Math.min(p.ids.length-1,cur+(key==='J'?1:-1)));
    const targetId=p.ids[nextIdx];
    scrollToQuestion(ctx, targetId);
    return;
  }
  const q=ctx.questions[ctx.activeQid];
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
    delete ctx.answers[ctx.activeQid];
    document.getElementById(`q-wrap-${ctx.activeQid}`)?.querySelectorAll('input').forEach(i=>i.checked=false);
    ctx.syncPages();ctx.persist();refreshQuestionUI(ctx,ctx.activeQid);updateProgress(ctx);
    return;
  }
  if(mapped){
    const input=document.querySelector(`fieldset[data-qid="${ctx.activeQid}"] input[value="${mapped}"]`);
    if(input){
      e.preventDefault();
      input.checked=true;
      ctx.answers[ctx.activeQid]=/^[1-5]$/.test(mapped)?Number(mapped):mapped;
      ctx.syncPages();ctx.persist();refreshQuestionUI(ctx,ctx.activeQid);updateProgress(ctx);
    }
  }
}
