import {CLARIFICATIONS} from './clarification.mjs';
import {questionnairePages} from './flow.mjs';
import {validateAnswers, exportAnswers as answerEnvelope} from './core.mjs';
import {$, esc, KEY, toast, download} from './ui/shared.mjs';
import {renderHome} from './ui/home.mjs';
import {renderQuiz, handleQuizKeydown} from './ui/quiz.mjs';
import {renderReport} from './ui/report.mjs';
import {openOverview, openProfilesModal, openImport, openAbout, confirmReport, confirmReset} from './ui/modals.mjs';

const main=$('#main');
let suppressHashSync=false;

const ctx={
  main,
  bank:null,
  pages:[],
  questions:{},
  answers:{},
  page:0,
  view:'home',
  remember:false,
  saveError:'',
  legacyAvailable:false,
  activeQid:null,
  reportFilter:'all',
  radarCompareId:null,
  radarMode:'standard',
  selectedDimIndex:null,

  activeIds:()=>ctx.pages.flatMap(p=>p.ids),
  count:()=>ctx.activeIds().filter(id=>ctx.answers[id]!=null).length,
  total:()=>ctx.activeIds().length,
  pageCount:p=>p.ids.filter(id=>ctx.answers[id]!==undefined && ctx.answers[id]!==null).length,

  syncPages(){
    const current=ctx.pages?.[ctx.page]?.id;
    ctx.pages=questionnairePages(ctx.answers,ctx.bank);
    const index=ctx.pages.findIndex(p=>p.id===current);
    ctx.page=index>=0?index:Math.min(ctx.page,ctx.pages.length-1);
  },

  persist(){
    if(!ctx.remember)return;
    try{localStorage.setItem(KEY,JSON.stringify({version:ctx.bank.version,answers:ctx.answers,page:ctx.page,view:ctx.view}));ctx.saveError='';}
    catch{ctx.saveError='此浏览器无法保存进度。请导出答案，关闭页面前自行保留。';toast(ctx.saveError);}
  },

  saveStatus(){return ctx.saveError || (ctx.remember?'进度保存在此浏览器的本地存储中':'当前仅在本页保留，刷新后会丢失');},

  setRemember(value){
    ctx.remember=value;
    if(value)ctx.persist();
    else{try{localStorage.removeItem(KEY);ctx.saveError='';}catch{ctx.saveError='无法移除本地存档，请使用浏览器网站数据设置清除。';toast(ctx.saveError);}}
    const status=$('#save-status');
    if(status){status.textContent=ctx.saveStatus();status.className=`fine ${ctx.saveError?'save-warning':''}`;}
  },

  bindRemember(){$('#remember')?.addEventListener('change',e=>ctx.setRemember(e.target.checked));},

  exportAnswers(){
    download('political-values-v2-answers.json',JSON.stringify(answerEnvelope(ctx.answers,ctx.bank),null,2)+'\n','application/json');
  },

  go(next, nextPage=ctx.page, {push=true}={}){
    ctx.syncPages();
    ctx.view=next;
    ctx.page=Math.max(0,Math.min(ctx.pages.length-1,nextPage));
    ctx.persist();
    if(push && !suppressHashSync){
      const targetHash=next==='quiz'?`#quiz/${ctx.pages[ctx.page].id}`:next==='report'?'#report':'#home';
      if(location.hash!==targetHash)history.pushState(null,'',targetHash);
    }
    render();
    main.focus({preventScroll:true});
    window.scrollTo({top:0,behavior:'instant'});
  },

  openOverview:()=>openOverview(ctx),
  openProfilesModal:()=>openProfilesModal(),
  openImport:()=>openImport(ctx),
  confirmReport:()=>confirmReport(ctx),
  confirmReset:()=>confirmReset(ctx),
};

function render(){
  if(ctx.view==='quiz')renderQuiz(ctx);
  else if(ctx.view==='report')renderReport(ctx);
  else renderHome(ctx);
}

function applyHashRoute(){
  if(!ctx.bank)return;
  const modal=$('#modal');
  if(modal?.open)modal.close();
  const hash=location.hash.replace(/^#\/?/,'');
  suppressHashSync=true;
  if(hash==='report')ctx.go('report',ctx.page,{push:false});
  else if(hash.startsWith('quiz/')){
    const pid=hash.slice(5);
    const idx=ctx.pages.findIndex(p=>p.id===pid);
    ctx.go('quiz',idx>=0?idx:ctx.page,{push:false});
  }else if(hash==='quiz')ctx.go('quiz',ctx.page,{push:false});
  else ctx.go('home',ctx.page,{push:false});
  suppressHashSync=false;
}

function setupThemeToggle(){
  const btn=$('#theme-button');
  if(!btn)return;
  const isDark=()=>{
    const explicit=document.documentElement.dataset.theme;
    if(explicit)return explicit==='dark';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  };
  const syncLabel=()=>{
    const dark=isDark();
    btn.textContent=dark?'浅色':'深色';
    btn.setAttribute('aria-pressed',String(dark));
  };
  syncLabel();
  btn.onclick=()=>{
    document.documentElement.dataset.theme=isDark()?'light':'dark';
    syncLabel();
  };
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change',syncLabel);
}

async function init(){
  try{
    const response=await fetch('./data.json');
    if(!response.ok)throw new Error(`题库加载失败（${response.status}）`);
    ctx.bank=await response.json();
    ctx.questions=Object.fromEntries([...ctx.bank.items,...ctx.bank.scenarios,...ctx.bank.feedback,...CLARIFICATIONS].map(q=>[q.id,q]));
    ctx.syncPages();
    try{
      const raw=localStorage.getItem(KEY);
      if(raw){
        const saved=JSON.parse(raw);
        if(![ctx.bank.version,'2.0.0-exploratory'].includes(saved.version))throw new Error('version');
        validateAnswers(saved.answers,ctx.bank);
        ctx.answers=Object.fromEntries(Object.entries(saved.answers).filter(([,v])=>v!==null));
        ctx.syncPages();
        ctx.page=Number.isInteger(saved.page)&&saved.page>=0&&saved.page<ctx.pages.length?saved.page:0;
        ctx.remember=true;
      }
    }catch{ctx.saveError='本地进度无法读取或版本不匹配。旧数据未自动删除，请先备份已有答案。';}
    try{ctx.legacyAvailable=!!localStorage.getItem('political-values-v1-local');}catch{}

    $('#about-button').onclick=()=>openAbout(ctx);
    $('#profiles-button').onclick=()=>openProfilesModal();
    $('.brand').onclick=e=>{e.preventDefault();ctx.go('home');};
    setupThemeToggle();
    document.addEventListener('keydown',e=>handleQuizKeydown(ctx,e));
    window.addEventListener('hashchange',applyHashRoute);
    window.addEventListener('beforeunload',e=>{
      if(ctx.count()>0 && !ctx.remember){e.preventDefault();e.returnValue='';}
    });

    if(location.hash && location.hash!=='#home')applyHashRoute();
    else renderHome(ctx);
  }catch(err){
    main.innerHTML=`<div class="loading"><h1>问卷暂时无法载入</h1><p>${esc(err.message)}</p><button type="button" class="button" id="retry">重新加载</button><p><a href="docs/问卷.html">使用文字版问卷</a></p></div>`;
    $('#retry').onclick=()=>location.reload();
  }
}
init();
