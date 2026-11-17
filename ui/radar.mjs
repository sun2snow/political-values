import {IDEOLOGIES} from '../ideology.mjs';
import {esc} from './shared.mjs';

export const RADAR_MODES = {
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

function radarPoint(cx,cy,radius,index,totalAxes,value){
  const angle=(-Math.PI/2)+(2*Math.PI*index/totalAxes);
  const r=(Math.max(0,Math.min(100,value))/100)*radius;
  return [cx+r*Math.cos(angle), cy+r*Math.sin(angle), angle];
}

export function homeRadarSvg(){
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

export function reportRadarSvg(dimensions, compareProfile, mode='standard'){
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
    return `<text x="${lx.toFixed(1)}" y="${(ly+3).toFixed(1)}" text-anchor="middle" class="radar-ring-label">${txt}</text>`;
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

export function radarLegendMarkup(compareProfile, mode='standard'){
  const base=`<span class="legend-item"><span class="legend-swatch user"></span>你的十维画像</span>${compareProfile?`<span class="legend-item"><span class="legend-swatch ref"></span>${esc(compareProfile.name)}（参考点）</span>`:''}`;
  if(mode!=='intensity')return base;
  return `${base}<span class="legend-item"><span class="legend-dot left"></span>偏 0 端 (≤35)</span><span class="legend-item"><span class="legend-dot mid"></span>中间 (35–65)</span><span class="legend-item"><span class="legend-dot right"></span>偏 100 端 (≥65)</span>`;
}

export function radarCardMarkup(r, compareProfile, radarCompareId, radarMode){
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
    <div class="radar-readout" id="radar-readout">${esc(cfg.readoutHint)}</div>
    ${compareProfile?`<details class="compare-table-details"><summary>查看十维数值对比表（与「${esc(compareProfile.name)}」）</summary><table class="compare-table"><thead><tr><th>维度</th><th>你的得分</th><th>参考点</th><th>差值</th></tr></thead><tbody>${r.dimensions.map((d,i)=>{const ref=compareProfile.point[i];const diff=d.score===null?'—':(d.score-ref>0?'+':'')+(d.score-ref).toFixed(1);return `<tr><td>${esc(d.name)}</td><td>${d.score===null?'信息不足':d.score.toFixed(1)}</td><td>${ref}</td><td>${diff}</td></tr>`;}).join('')}</tbody></table></details>`:''}`;
}

export function rankedIdeologies(result){
  const dims=Array.from({length:10},(_,i)=>result.dimensions.find(d=>d.id===`D${i+1}`));
  if(dims.some(d=>!d || d.score===null || (d.base_answered??d.answered)<6))return [];
  return IDEOLOGIES.map(p=>({...p,distance:Math.sqrt(dims.reduce((sum,d,i)=>sum+(d.score-p.point[i])**2,0)/10)}))
    .sort((a,b)=>a.distance-b.distance || a.id.localeCompare(b.id,'en'));
}
