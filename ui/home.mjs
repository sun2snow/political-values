import {$, applyDynamicStyles, rememberMarkup} from './shared.mjs';
import {homeRadarSvg} from './radar.mjs';

export function homeGraphic(){
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

export function renderHome(ctx){
  const answered=ctx.count(), all=ctx.total(), pct=all?Math.round(answered/all*100):0;
  ctx.main.innerHTML=`<section class="hero">
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
      ${rememberMarkup(ctx.remember, ctx.saveStatus(), ctx.saveError)}
      ${ctx.legacyAvailable?'<p class="notice-box">检测到旧版（v1）进度。新版题目已改写，旧答案不会自动套用。<a href="legacy/v1/">继续旧版问卷 ↗</a></p>':''}
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
  $('#start').onclick=()=>ctx.go('quiz',answered?ctx.page:0);
  $('#import-home').onclick=ctx.openImport;
  $('#existing-result')?.addEventListener('click',ctx.confirmReport);
  $('#home-profiles-btn')?.addEventListener('click',ctx.openProfilesModal);
  ctx.bindRemember();
}
