import {clarificationsFor} from './clarification.mjs';
import {questionnairePages} from './flow.mjs';
import {BANK_VERSION,compatibleAnswerVersion, validateAnswers, exportAnswers as answerEnvelope} from './core.mjs';
import {$, esc, toast, download, showModal} from './ui/shared.mjs';
import {ProgressStore} from './ui/storage.mjs';
import {renderHome} from './ui/home.mjs';
import {renderQuiz, handleQuizKeydown} from './ui/quiz.mjs';
import {renderReport} from './ui/report.mjs';
import {openOverview, openProfilesModal, openImport, openAbout, confirmReport, confirmReset} from './ui/modals.mjs';

const main=$('#main');
const requestedVersion=new URLSearchParams(location.search).get('version');
let suppressHashSync=false;
let store;

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
  versionLabel:'v2.2',
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

  snapshot(){return {version:ctx.bank.version,answers:ctx.answers,page:ctx.page,view:ctx.view};},
  persist(){if(ctx.remember)return store.save(ctx.snapshot());},

  saveStatus(){if(store.removal==='pending')return '正在删除本地存档，旧答案可能仍在本机。请等到删除完成再离开。';return ctx.saveError || (ctx.remember?(store.isSaved(ctx.answers)?'进度保存在此浏览器的本地存储中':'正在保存，请勿关闭页面…'):'当前仅在本页保留，刷新后会丢失');},

  async setRemember(value){
    if(value)await store.enableSaving(ctx.snapshot());
    else await store.clear();
    updateSaveUI();
  },

  async clearProgress(){
    // Always clear memory, even if the browser refuses storage operations.
    ctx.answers={};ctx.remember=false;ctx.page=0;ctx.activeQid=null;
    ctx.radarCompareId=null;ctx.selectedDimIndex=null;
    return store.clear();
  },

  get preserveDisk(){return store.access!=='ready';},
  bindRemember(){
    $('#backup-raw')?.addEventListener('click',()=>{
      const raw=store.protectedBackup();
      if(raw!==null)download('political-values-original.txt',raw,'text/plain;charset=utf-8');
    });
    $('#replace-raw')?.addEventListener('click',()=>{
      if(store.access!=='protected')return;
      showModal('替换原始存档？','<p>原始记录不会合并或迁移。确认后，本页答案将取代原始记录，并开启本地保存。即使本页没有答案，也会替换。需要保留原记录，请先取消并下载备份。</p><div class="actions"><button type="button" class="button secondary" id="cancel-replace">取消，保留原记录</button><button type="button" class="button danger" id="confirm-replace">确认替换并保存</button></div>');
      $('#cancel-replace').onclick=()=>$('#modal').close();
      $('#confirm-replace').onclick=async()=>{
        $('#modal').close();
        await store.replaceProtected(ctx.snapshot());
        // Answers or page may have changed while waiting for the writer lock.
        ctx.persist();
      };
    });
    $('#remember')?.addEventListener('change',e=>ctx.setRemember(e.target.checked));
    $('#retry-remove')?.addEventListener('click',()=>store.clear());
    updateSaveUI();
  },

  exportAnswers(){
    download(`political-values-${ctx.versionLabel}-answers.json`,JSON.stringify(answerEnvelope(ctx.answers,ctx.bank),null,2)+'\n','application/json');
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

function updateSaveUI(){
  ctx.remember=store.enabled;ctx.saveError=store.error;
  const checkbox=$('#remember');if(checkbox){checkbox.checked=ctx.remember;checkbox.disabled=ctx.preserveDisk||store.removal==='pending';}
  const recovery=$('#protected-record');if(recovery)recovery.hidden=store.access!=='protected';
  const replace=$('#replace-raw');if(replace)replace.disabled=store.pending>0;
  const retry=$('#retry-remove');if(retry)retry.hidden=store.removal!=='failed';
  const status=$('#save-status');
  if(status){status.textContent=ctx.saveStatus();status.className=`fine ${ctx.saveError?'save-warning':''}`;}
}
store=new ProgressStore({onChange:updateSaveUI});

function render(){
  if(ctx.view==='quiz')renderQuiz(ctx);
  else if(ctx.view==='report')renderReport(ctx);
  else renderHome(ctx);
}

function applyHashRoute(){
  if(!ctx.bank)return;
  // Document anchors are not application routes.
  if(location.hash==='#main')return;
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
    if(requestedVersion!==null&&requestedVersion!=='2.2'){
      location.replace('./legacy/v1/');return;
    }
    const response=await fetch('./data.json');
    if(!response.ok)throw new Error(`题库加载失败（${response.status}）`);
    const bank=await response.json();
    if(bank.version!==BANK_VERSION)throw new Error('题库版本与本页不符，未读取或写入进度。请刷新后重试。');
    ctx.bank=bank;
    ctx.questions=Object.fromEntries([...ctx.bank.items,...ctx.bank.scenarios,...ctx.bank.feedback,...clarificationsFor(ctx.bank)].map(q=>[q.id,q]));
    ctx.syncPages();
    try{
      const raw=store.load();
      if(raw!==null){
        const saved=JSON.parse(raw);
        if(!compatibleAnswerVersion(saved.version,ctx.bank))throw new Error('version');
        validateAnswers(saved.answers,ctx.bank);
        ctx.answers=Object.fromEntries(Object.entries(saved.answers).filter(([,v])=>v!==null));
        ctx.syncPages();
        ctx.page=Number.isInteger(saved.page)&&saved.page>=0&&saved.page<ctx.pages.length?saved.page:0;
        store.accept(ctx.answers,ctx.page);ctx.remember=true;
      }
    }catch{store.fail(store.access==='protected'?'原始存档格式无效或版本不符，已保留原记录。本页不会自动保存。':'无法读取本地存储，本页不会写入或删除存档。可导出本页答案，或刷新后重试。');}
    $('#footer-version').textContent=`探索版 ${ctx.versionLabel} · 纯本地计分 · 非诊断工具`;

    $('#about-button').onclick=()=>openAbout(ctx);
    $('#profiles-button').onclick=()=>openProfilesModal();
    $('.brand').onclick=e=>{e.preventDefault();ctx.go('home');};
    setupThemeToggle();
    document.addEventListener('keydown',e=>handleQuizKeydown(ctx,e));
    window.addEventListener('hashchange',applyHashRoute);
    window.addEventListener('beforeunload',e=>{
      if(store.needsLeaveWarning(ctx.answers)){e.preventDefault();e.returnValue='';}
    });
    window.addEventListener('storage',e=>{
      try{
        const change=store.externalChange(e);
        if(change==='deleted'){
          ctx.answers={};ctx.activeQid=null;ctx.radarCompareId=null;ctx.selectedDimIndex=null;
          ctx.syncPages();render();
        }
        if(change)toast(ctx.saveError);
      }catch{store.fail('无法核对本地存档，已停止自动保存。请导出本页答案。');}
    });

    if(location.hash==='#main'){renderHome(ctx);main.focus();}
    else if(location.hash && location.hash!=='#home')applyHashRoute();
    else renderHome(ctx);
  }catch(err){
    main.innerHTML=`<div class="loading"><h1>问卷暂时无法载入</h1><p>${esc(err.message)}</p><button type="button" class="button" id="retry">重新加载</button><p><a href="docs/问卷.html">使用文字版问卷</a></p></div>`;
    $('#retry').onclick=()=>location.reload();
  }
}
if(window.self===window.top)init();
