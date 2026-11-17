import {IDEOLOGIES, CLASSIFIER_VERSION} from '../ideology.mjs';
import {parseAnswers, score} from '../core.mjs';
import {$, esc, applyDynamicStyles, showModal, toast} from './shared.mjs';

export function openOverview(ctx){
  const modal=$('#modal'), content=$('#modal-content');
  showModal('题目导航',`<p>点击任意页面即可跳转修改答案。计数包含“无法判断”和“题意不清”。</p>
    <div class="page-grid">${ctx.pages.map((p,i)=>{
      const done=ctx.pageCount(p), len=p.ids.length, pct=len?Math.round(done/len*100):0;
      return `<button type="button" class="page-link ${i===ctx.page?'active':''} ${done===len?'complete':''}" data-page="${i}">${esc(p.short)}<span>${done} / ${len} 题</span><div class="page-link-bar"><div class="page-link-bar-fill" data-width="${pct}"></div></div></button>`;
    }).join('')}</div>
    <div class="actions"><button type="button" class="button secondary" id="nav-export">导出答案</button><button type="button" class="button secondary" id="nav-import">导入答案</button><button type="button" class="text-button" id="nav-home">返回首页</button></div>`);
  applyDynamicStyles();
  content.querySelectorAll('[data-page]').forEach(el=>el.onclick=()=>{modal.close();ctx.go('quiz',Number(el.dataset.page));});
  $('#nav-export').onclick=ctx.exportAnswers;
  $('#nav-import').onclick=()=>openImport(ctx);
  $('#nav-home').onclick=()=>{modal.close();ctx.go('home');};
}

export function confirmReport(ctx){
  const modal=$('#modal');
  const result=score(ctx.answers,ctx.bank), insufficient=result.dimensions.filter(d=>d.score===null);
  const firstClarification=ctx.pages.findIndex(p=>p.type==='clarification'&&p.ids.some(id=>ctx.answers[id]==null));
  if(firstClarification>=0 && !(ctx.view==='quiz'&&ctx.pages[ctx.page].type==='clarification')){ctx.go('quiz',firstClarification);return;}
  const missing=ctx.total()-ctx.count();
  if(!missing&&!insufficient.length){ctx.go('report');return;}
  showModal('按当前答案生成画像',`<p>当前已选择 <strong>${ctx.count()} / ${ctx.total()}</strong> 题；可计分核心答案 <strong>${result.scored_answers} / 80</strong> 题。</p>
    <p>${insufficient.length?`${insufficient.length} 个维度不足6道有效答案，将显示“信息不足”。`:'全部维度已达到最低计分门槛。'} “无法判断”和“题意不清”不计入分数。</p>
    <p>已回答 ${result.supplemental_answers} / ${result.supplemental_offered} 道补充题。补充题可以跳过。</p>
    <p>澄清题也可以跳过；没有足够证据时，不会把平均分接近中间直接认定为中间主义。可以先查看结果，之后仍可随时回来修改。</p>
    <div class="actions"><button type="button" class="button" id="confirm-report">查看当前画像</button><button type="button" class="button secondary" id="fill-missing">继续补充答案</button></div>`);
  $('#confirm-report').onclick=()=>{modal.close();ctx.go('report');};
  $('#fill-missing').onclick=()=>{modal.close();const first=ctx.pages.findIndex(p=>p.ids.some(id=>ctx.answers[id]==null || ['U','Q'].includes(ctx.answers[id])));ctx.go('quiz',first<0?ctx.page:first);};
}

export function openProfilesModal(){
  const content=$('#modal-content');
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

export function openImport(ctx){
  const modal=$('#modal');
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
      const imported=parseAnswers($('#answer-text').value,ctx.bank);
      ctx.answers=Object.fromEntries(Object.entries(imported).filter(([,v])=>v!==null));
      ctx.page=0;ctx.radarCompareId=null;ctx.selectedDimIndex=null;ctx.syncPages();modal.close();ctx.go('quiz',0);
      toast(`已导入 ${ctx.count()} 道题的答案。`);
    }catch(err){$('#import-error').textContent=err.message;}
  };
}

export function confirmReset(ctx){
  const modal=$('#modal');
  showModal('清除本次答案',`<p>这会清除当前页面的答案及此网站在本浏览器保存的进度。已经下载的文件不会被删除。清除后无法从本页恢复。</p>
    <div class="actions"><button type="button" class="button secondary" id="backup">先导出答案</button><button type="button" class="button danger" id="confirm-reset">确认清除并重新开始</button></div>`);
  $('#backup').onclick=ctx.exportAnswers;
  $('#confirm-reset').onclick=async()=>{
    const button=$('#confirm-reset');button.disabled=true;
    const pending=ctx.clearProgress();
    modal.close();ctx.go('home');
    const deleted=await pending;
    toast(deleted?'本次答案和本地进度已清除。':ctx.saveError);
  };
}

export function openAbout(ctx){
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
    <p class="fine">问卷版本：${esc(ctx.bank.version)}。先按十维距离寻找参考画像，再核实中间主义所需证据，从${IDEOLOGIES.length}种参考画像中比较，归纳版本${CLASSIFIER_VERSION}；思想传统提示不代表唯一身份。</p>`);
}
