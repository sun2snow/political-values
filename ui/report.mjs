import {closestIdeology, clarificationSummary, IDEOLOGIES} from '../ideology.mjs';
import {score, describeDimension, markdownReport} from '../core.mjs';
import {$, esc, coreOptions, applyDynamicStyles, download, rememberMarkup} from './shared.mjs';
import {RADAR_MODES, radarCardMarkup, rankedIdeologies} from './radar.mjs';
import {scrollToQuestion} from './quiz.mjs';

function closestMarkup(ctx, result, ranked){
  const c=closestIdeology(result);
  if(c.status==='insufficient')return `<section class="ideology-summary" aria-labelledby="ideology-heading">
    <div><p class="eyebrow">YOUR CLOSEST TRADITION</p><h2 id="ideology-heading">最贴近的意识形态</h2><p>${esc(c.explanation)}</p></div>
    <p class="fine">请先完成每个维度至少6道有效基础题，系统才能生成十维距离对照。</p>
  </section>`;

  const clarificationHtml=clarificationSummary(result,c);
  const top3Html=ranked.length?`<div class="nearest-strip">
    <span class="nearest-strip-label">十维几何距离最近的参考画像（点击可在右图对照）：</span>
    <div class="nearest-chips">${ranked.slice(0,3).map((item,idx)=>`<button type="button" class="nearest-chip ${ctx.radarCompareId===item.id?'active':''}" data-compare-id="${item.id}">${idx+1}. ${esc(item.name)} <small>距离 ${item.distance.toFixed(1)}</small></button>`).join('')}</div>
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

function dimensionItemsMarkup(ctx, d){
  const activeSet=new Set(ctx.activeIds());
  const items=ctx.bank.items.filter(i=>i.dimension===d.id && activeSet.has(i.id));
  const rows=items.map(item=>{
    const val=ctx.answers[item.id];
    const ansText=val==null?'未作答':(coreOptions[String(val)]??String(val));
    let dirText='不计分';
    if(Number.isInteger(val)){
      const z=(val-3)*item.direction||0;
      dirText=z<0?'偏左端':z>0?'偏右端':'中立';
    }
    return `<div class="dim-item-row">
      <div class="dim-item-text">
        <div><strong>${esc(item.id)}</strong>${item.status==='supplemental'?' · <span class="pill amber">补充</span>':''} ${esc(item.text)}</div>
        <div class="dim-item-meta"><span>选择：${esc(ansText)}</span><span>·</span><span>计分方向：${dirText}</span></div>
      </div>
      <button type="button" class="dim-item-jump" data-edit-qid="${esc(item.id)}">去修改</button>
    </div>`;
  }).join('');
  return `<details class="dim-items-details"><summary>查看本维度题目与作答明细 (${d.answered}/${d.total_items})</summary><div class="dim-item-list">${rows}</div></details>`;
}

function dimensionCardMarkup(ctx, d){
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
      ${dimensionItemsMarkup(ctx, d)}
    </div>
  </article>`;
}

function filteredDimensions(filter, dimensions){
  if(filter==='extreme')return dimensions.filter(d=>d.band==='low'||d.band==='high');
  if(filter==='middle')return dimensions.filter(d=>d.band==='middle');
  if(filter==='mixed')return dimensions.filter(d=>d.supplemental_offered>0||(d.counts.left>=2&&d.counts.right>=2));
  return dimensions;
}

export function renderReport(ctx){
  const r=score(ctx.answers,ctx.bank), profiles=r.profiles.filter(p=>p.triggered), ranked=rankedIdeologies(r);
  const closest=closestIdeology(r);
  if(ctx.radarCompareId===null){
    ctx.radarCompareId=closest.id || ranked[0]?.id || 'none';
  }
  const compareProfile=IDEOLOGIES.find(p=>p.id===ctx.radarCompareId) || null;
  const extremeCount=r.dimensions.filter(d=>d.band==='low'||d.band==='high').length;
  const mixedCount=r.dimensions.filter(d=>d.supplemental_offered>0||(d.counts.left>=2&&d.counts.right>=2)).length;
  const middleCount=r.dimensions.filter(d=>d.band==='middle').length;
  const shownDims=filteredDimensions(ctx.reportFilter, r.dimensions);

  ctx.main.innerHTML=`<div class="report">
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
      ${closestMarkup(ctx, r, ranked)}
      <section class="radar-card" id="radar-card" aria-label="十维立场雷达图">${radarCardMarkup(r, compareProfile, ctx.radarCompareId, ctx.radarMode)}</section>
    </div>

    <section class="report-section" aria-label="十个维度的详细画像">
      <div class="report-section-head">
        <div>
          <h2>十个维度的画像</h2>
          <p class="fine">虚线空心点（如有）为补充题前的基础分，实心绿点为当前分数；底部色条按左向（陶土）、中立（灰绿）、右向（深绿）比例绘制。</p>
        </div>
      </div>
      <div class="filter-tabs" role="tablist" aria-label="筛选维度卡片">
        <button type="button" class="filter-tab ${ctx.reportFilter==='all'?'active':''}" data-filter="all">全部维度 (${r.dimensions.length})</button>
        <button type="button" class="filter-tab ${ctx.reportFilter==='extreme'?'active':''}" data-filter="extreme">明显偏向 (${extremeCount})</button>
        <button type="button" class="filter-tab ${ctx.reportFilter==='middle'?'active':''}" data-filter="middle">中间区域 (${middleCount})</button>
        <button type="button" class="filter-tab ${ctx.reportFilter==='mixed'?'active':''}" data-filter="mixed">双向 / 已补充 (${mixedCount})</button>
      </div>
      <div class="dimensions-grid" id="dimensions-grid">
        ${shownDims.length?shownDims.map(d=>dimensionCardMarkup(ctx,d)).join(''):'<div class="notice-box">当前筛选条件下没有维度，请切换上方标签查看。</div>'}
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
          ${p.ids.map(id=>{const s=r.scenarios.find(x=>x.id===id);return `<div class="scenario-item"><div class="scenario-q"><strong>${id}</strong> · ${esc(ctx.questions[id].text)}</div><div class="scenario-a">${esc(s.text??'未作答')}</div></div>`;}).join('')}
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
      ${rememberMarkup(ctx.remember, ctx.saveStatus(), ctx.saveError)}
      <button type="button" class="text-button" id="reset">清除本次答案并重新开始</button>
    </section>
  </div>`;

  applyDynamicStyles();

  const updateRadarCard=()=>{
    const card=$('#radar-card');
    const comp=IDEOLOGIES.find(p=>p.id===ctx.radarCompareId)||null;
    card.innerHTML=radarCardMarkup(r, comp, ctx.radarCompareId, ctx.radarMode);
    document.querySelectorAll('[data-compare-id]').forEach(btn=>btn.classList.toggle('active',btn.dataset.compareId===ctx.radarCompareId));
    bindRadarEvents();
  };

  const bindRadarEvents=()=>{
    const host=$('#radar-svg-host');
    const readout=$('#radar-readout');
    const comp=IDEOLOGIES.find(p=>p.id===ctx.radarCompareId)||null;
    const showDim=idx=>{
      const d=r.dimensions[idx];
      if(!d)return;
      ctx.selectedDimIndex=idx;
      host.querySelectorAll('[data-dim-index]').forEach(el=>el.classList.toggle('is-selected',Number(el.dataset.dimIndex)===idx));
      const cfg=RADAR_MODES[ctx.radarMode]||RADAR_MODES.standard;
      const axisName=cfg.axisLabel(d,idx);
      const userStr=d.score===null?'信息不足':`${d.score.toFixed(1)} 分`;
      const lean=d.score===null?'':d.score<=35?`（偏向：${d.low}）`:d.score>=65?`（偏向：${d.high}）`:'（中间区域）';
      if(ctx.radarMode==='autonomy' && idx<2){
        const plotted=d.score===null?'—':(100-d.score).toFixed(1);
        const refPlot=comp?(100-comp.point[idx]):null;
        const refStr=comp?` ｜ ${comp.name}图上 ${refPlot}（原参考点 ${comp.point[idx]}）`:'';
        readout.textContent=`${axisName}：图上位置 ${plotted}（= 100 − ${d.name}原得分 ${userStr}${lean}）${refStr}`;
      }else if(ctx.radarMode==='intensity'){
        const amp=d.score===null?'—':(Math.abs(d.score-50)*2).toFixed(1);
        const refAmp=comp?(Math.abs(comp.point[idx]-50)*2).toFixed(0):null;
        const refStr=comp?` ｜ ${comp.name}鲜明度 ${refAmp}%（原参考点 ${comp.point[idx]}）`:'';
        readout.textContent=`${d.name}：鲜明度 ${amp}%（真实得分 ${userStr}${lean}）${refStr}`;
      }else{
        const refStr=comp?` ｜ ${comp.name}参考点：${comp.point[idx]}`:'';
        readout.textContent=`${d.name}：${userStr}${lean}${refStr}`;
      }
    };
    if(ctx.selectedDimIndex!==null)showDim(ctx.selectedDimIndex);
    host.querySelectorAll('[data-dim-index]').forEach(el=>{
      const idx=Number(el.dataset.dimIndex);
      el.addEventListener('mouseenter',()=>showDim(idx));
      el.addEventListener('focus',()=>showDim(idx));
      el.addEventListener('click',()=>showDim(idx));
    });
    $('#radar-compare')?.addEventListener('change',e=>{
      ctx.radarCompareId=e.target.value;
      updateRadarCard();
    });
    document.querySelectorAll('[data-radar-mode]').forEach(btn=>btn.addEventListener('click',()=>{
      ctx.radarMode=btn.dataset.radarMode;
      updateRadarCard();
    }));
  };
  bindRadarEvents();

  document.querySelectorAll('[data-compare-id]').forEach(btn=>btn.addEventListener('click',()=>{
    ctx.radarCompareId=btn.dataset.compareId;
    updateRadarCard();
  }));
  document.querySelectorAll('.filter-tab').forEach(btn=>btn.addEventListener('click',()=>{
    ctx.reportFilter=btn.dataset.filter;
    document.querySelectorAll('.filter-tab').forEach(t=>t.classList.toggle('active',t.dataset.filter===ctx.reportFilter));
    const list=filteredDimensions(ctx.reportFilter, r.dimensions);
    $('#dimensions-grid').innerHTML=list.length?list.map(d=>dimensionCardMarkup(ctx,d)).join(''):'<div class="notice-box">当前筛选条件下没有维度，请切换上方标签查看。</div>';
    applyDynamicStyles();
  }));

  $('#dimensions-grid').addEventListener('click',e=>{
    const jump=e.target.closest('[data-edit-qid]');
    if(!jump)return;
    const qid=jump.dataset.editQid;
    const pageIdx=ctx.pages.findIndex(p=>p.ids.includes(qid));
    if(pageIdx<0)return;
    ctx.activeQid=qid;
    ctx.go('quiz',pageIdx);
    requestAnimationFrame(()=>scrollToQuestion(ctx,qid));
  });

  $('#report-export').onclick=()=>download('political-values-report.md',markdownReport(r),'text/markdown;charset=utf-8');
  $('#answer-export').onclick=ctx.exportAnswers;
  $('#edit-answers').onclick=()=>{ctx.go('quiz',ctx.page);ctx.openOverview();};
  $('#print-report').onclick=()=>{document.querySelectorAll('.compare-table-details, .ideology-summary details').forEach(d=>d.open=true);window.print();};
  $('#reset').onclick=ctx.confirmReset;
  ctx.bindRemember();
}
