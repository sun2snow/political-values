// Browser security/regression probes. Every probe must pass before deployment.
// Run via npm run test:audit (separate from the fast tests/*.test.mjs glob).
// AUDIT_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
// AUDIT_CHROMIUM=/absolute/path/to/chrome node --test tests/audit.browser.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';
import {PROGRESS_KEY as KEY} from '../ui/storage.mjs';

const {chromium}=await import(process.env.AUDIT_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.AUDIT_PLAYWRIGHT_MODULE).href : 'playwright');
const root=resolve(process.env.SITE_ROOT||fileURLToPath(new URL('../',import.meta.url)));
const bank=JSON.parse(await readFile(new URL('../data.json',import.meta.url),'utf8'));
const targets=[25,25,75,75,50,75,75,50,75,25];
const fullAnswers=Object.fromEntries(bank.items.filter(i=>i.status==='core').map(i=>[
  i.id,3+(targets[Number(i.dimension.slice(1))-1]-50)/25*i.direction
]));
const saved=answers=>JSON.stringify({version:bank.version,answers,page:0,view:'home'});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
  try{
    const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!path.startsWith(root+sep)&&path!==root)throw new Error('outside root');
    const file=path+(req.url.split('?')[0].endsWith('/')?'/index.html':'');
    res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');
    res.end(await readFile(file));
  }catch{res.writeHead(404);res.end('not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
let browser;
try{browser=await chromium.launch({executablePath:process.env.AUDIT_CHROMIUM||undefined});}
catch(err){await new Promise(r=>server.close(r));throw err;}
const observations=[];

await test('Browser security regression suite',async t=>{
  async function withPage(fn,{answers=null,init=null,hash=''}={}){
    const context=await browser.newContext({viewport:{width:1280,height:900}});
    context.setDefaultTimeout(5000);
    try{
      if(init)await context.addInitScript(init);
      const page=await context.newPage();
      await page.goto(base+'/');
      await page.waitForSelector('#start');
      if(answers){
        await page.evaluate(({KEY,value})=>localStorage.setItem(KEY,value),{KEY,value:saved(answers)});
        // Fragment-only goto does NOT reload app state; reload explicitly after seeding.
        await page.reload();await page.waitForSelector('#start');
        await page.goto(base+'/'+hash);
        await page.waitForSelector(hash==='#report'?'.report':'#start');
      }
      return await fn(page,context);
    }finally{await context.close();}
  }
  async function finding(id,fn){
    await t.test(id,async()=>{
      const evidence=await fn();
      observations.push({id,...evidence});
      assert.equal(evidence.safe,true,JSON.stringify(evidence));
    });
  }

  await finding('AUDIT-01 quota failure must still protect unsaved answers from unload',()=>withPage(async page=>{
    await page.click('#start');
    await page.locator('fieldset input[value="4"]').first().check();
    await page.check('#remember');
    await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('无法保存'));
    const warning=await page.textContent('#save-status');
    const protectedUnload=await page.evaluate(()=>{
      const e=new Event('beforeunload',{cancelable:true});
      window.dispatchEvent(e);return e.defaultPrevented;
    });
    return {safe:protectedUnload,warning,protectedUnload};
  },{init:()=>{Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError');};}}));

  await finding('AUDIT-02 another open tab must not resurrect explicitly deleted answers',()=>withPage(async(page,context)=>{
    const other=await context.newPage();
    await other.goto(base+'/#quiz/base-0');await other.waitForSelector('#questions');
    await page.goto(base+'/#report');await page.waitForSelector('#reset');
    await page.click('#reset');await page.click('#confirm-reset');
    await page.waitForFunction(KEY=>localStorage.getItem(KEY)===null,KEY);
    await other.locator('fieldset input[value="4"]').first().check();
    const count=await other.evaluate(KEY=>Object.keys(JSON.parse(localStorage.getItem(KEY)||'{"answers":{}}').answers).length,KEY);
    return {safe:count===0,resurrectedAnswers:count};
  },{answers:fullAnswers}));

  await finding('AUDIT-03 independent tab edits must not silently overwrite newer saved answers',()=>withPage(async(page,context)=>{
    const other=await context.newPage();
    await other.goto(base+'/#quiz/base-0');await other.waitForSelector('#questions');
    await page.goto(base+'/#quiz/base-0');await page.waitForSelector('#questions');
    await page.locator('input[name="D2_02"][value="4"]').check();
    await page.waitForFunction(KEY=>JSON.parse(localStorage.getItem(KEY)).answers.D2_02===4,KEY);
    await other.locator('input[name="D3_01"][value="4"]').check();
    const disk=await other.evaluate(KEY=>JSON.parse(localStorage.getItem(KEY)).answers,KEY);
    return {safe:disk.D2_02===4,savedAnswers:disk};
  },{answers:{D1_01:4}}));

  const unloadProtected=page=>page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;});

  await finding('SAVE-16 opting back in cannot report a stale snapshot as saved',()=>withPage(async(page,context)=>{
    const other=await context.newPage();await other.goto(base+'/#quiz/base-0');await other.waitForSelector('#questions');
    await page.goto(base+'/#quiz/base-0');await page.locator('input[name=D1_01][value="4"]').check();
    await other.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('另一标签页'));
    await other.click('#remember');await other.waitForFunction(()=>!document.querySelector('#remember').checked);
    const disk=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).answers.D1_01,KEY);
    return {safe:disk===4&&await other.locator('input[name=D1_01]:checked').inputValue()==='3'&&await unloadProtected(other),disk};
  },{answers:{D1_01:3}}));

  await finding('SAVE-17 failure to save the last cleared answer protects an empty draft',()=>withPage(async page=>{
    await page.click('#start');await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new Error('quota');};});
    await page.click('[data-clear=D1_01]');await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('旧答案可能仍在本机'));
    return {safe:await unloadProtected(page)&&await page.locator('input[name=D1_01]:checked').count()===0};
  },{answers:{D1_01:3}}));

  await finding('SAVE-18 reset protects unload until disk deletion completes',()=>withPage(async page=>{
    await page.evaluate(k=>new Promise(ready=>{navigator.locks.request(k+'-writer',()=>new Promise(done=>{window.releaseAuditLock=done;ready();}));}),KEY);
    try{
      await page.click('#reset');await page.click('#confirm-reset');await page.waitForSelector('#start');
      const pending=await unloadProtected(page)&&await page.locator('#remember').isDisabled()&&(await page.textContent('#save-status')).includes('正在删除');
      await page.evaluate(()=>window.releaseAuditLock());await page.waitForFunction(k=>localStorage.getItem(k)===null&&!document.querySelector('#remember').disabled,KEY);
      return {safe:pending&&!await unloadProtected(page),pending};
    }finally{await page.evaluate(()=>window.releaseAuditLock());}
  },{answers:{D1_01:3},hash:'#report'}));

  await finding('IMPORT-19 replacing a file or pasting invalidates previous and in-flight imports',()=>withPage(async page=>{
    const envelope=n=>JSON.stringify({format:'political-values-answers',version:bank.version,answers:{D1_01:n}});
    const file=(name,buffer)=>({name,mimeType:'application/json',buffer});
    await page.click('#import-home');const input=page.locator('#answer-file'),confirm=page.locator('#confirm-import');
    await input.setInputFiles(file('a.json',Buffer.from(envelope(3))));await page.waitForFunction(()=>!document.querySelector('#confirm-import').disabled);
    await input.setInputFiles(file('large.json',Buffer.alloc(100001)));const rejected=await confirm.isDisabled()&&await page.inputValue('#answer-text')==='';
    await page.evaluate(()=>{const original=File.prototype.text;File.prototype.text=async function(){await new Promise(r=>window.finishRead=r);return original.call(this);};});
    await input.setInputFiles(file('slow.json',Buffer.from(envelope(4))));await page.waitForFunction(()=>!!window.finishRead);const pending=await confirm.isDisabled();
    await page.fill('#answer-text',envelope(2));await page.evaluate(()=>window.finishRead());await confirm.click();
    return {safe:rejected&&pending&&await page.locator('input[name=D1_01]:checked').inputValue()==='2',rejected,pending};
  }));

  await finding('SAVE-20 rejected record survives ordinary use, reset and cancelled replacement',()=>withPage(async page=>{
    const raw=' { "version": "2.1.0-exploratory", "answers": {"D1_01":2,"D2_05":5} }\n';
    await page.evaluate(([k,v])=>localStorage.setItem(k,v),[KEY,raw]);await page.reload();
    await page.waitForSelector('#backup-raw');assert.ok(await page.locator('#remember').isDisabled());
    const file=page.waitForEvent('download');await page.click('#backup-raw');assert.equal(await readFile(await (await file).path(),'utf8'),raw);
    await page.click('#replace-raw');await page.click('#cancel-replace');await page.goto(base+'/#report');
    await page.click('#reset');await page.click('#confirm-reset');await page.waitForSelector('#start');assert.equal(await page.evaluate(k=>localStorage.getItem(k),KEY),raw);
    await page.click('#start');await page.check('input[name=D1_01][value="4"]');assert.equal(await page.evaluate(k=>localStorage.getItem(k),KEY),raw);
    await page.click('#replace-raw');await page.click('#confirm-replace');await page.waitForFunction(()=>document.querySelector('#remember').checked);
    const record=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
    return {safe:record.version===bank.version&&JSON.stringify(record.answers)==='{"D1_01":4}'};
  }));

  await finding('NAV-21 cold start and reload at the main anchor render and focus the home page',()=>withPage(async(page,context)=>{
    const cold=await context.newPage();await cold.goto(base+'/#main');await cold.waitForSelector('#start');assert.equal(await cold.evaluate(()=>document.activeElement.id),'main');
    await cold.reload();await cold.waitForSelector('#start');return {safe:await cold.evaluate(()=>document.activeElement.id==='main')};
  }));

  await finding('KEY-24 explicit jumps focus the target before accepting a number',()=>withPage(async page=>{
    await page.click('#start');const dot=page.locator('.page-dot').nth(3),id=await dot.getAttribute('data-jump-q');await dot.focus();await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.qid),id);await page.keyboard.press('4');assert.equal(await page.inputValue(`input[name=${id}]:checked`),'4');
    await page.focus('#jump-unanswered');await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.dataset.qid),'D1_01');
    await page.keyboard.press('2');return {safe:await page.inputValue('input[name=D1_01]:checked')==='2'};
  }));

  await finding('AUDIT-04 skip-to-main must not replace quiz with homepage',()=>withPage(async page=>{
    await page.click('#start');
    await page.locator('fieldset input[value="4"]').first().check();
    await page.evaluate(()=>{window.auditHashChange=new Promise(resolve=>window.addEventListener('hashchange',()=>queueMicrotask(resolve),{once:true}));});
    await page.locator('.skip').focus();await page.keyboard.press('Enter');
    await page.evaluate(()=>window.auditHashChange);
    return {safe:await page.locator('#questions').count()===1,hash:await page.evaluate(()=>location.hash),heading:await page.textContent('h1')};
  }));

  await finding('AUDIT-05 PDF should not silently omit dimensions hidden by UI filtering',()=>withPage(async page=>{
    const before=await page.locator('.dimension').count();
    const filterText=await page.textContent('[data-filter="middle"]');
    await page.click('[data-filter="middle"]');
    await page.evaluate(()=>{window.print=()=>{};});
    await page.click('#print-report');
    await page.emulateMedia({media:'print'});
    const after=await page.locator('.dimension:visible').count();
    return {safe:after===10,before,filterText,printedDimensionCards:after,heading:await page.textContent('h1')};
  },{answers:fullAnswers,hash:'#report'}));

  await finding('AUDIT-06 dark-mode printing should use legible ink on the white page',()=>withPage(async page=>{
    await page.click('#theme-button');
    await page.emulateMedia({media:'print'});
    const colors=await page.evaluate(()=>({ink:getComputedStyle(document.body).color,paper:getComputedStyle(document.body).backgroundColor}));
    const channel=Number(colors.ink.match(/\d+/)[0]);
    return {safe:channel<100,...colors};
  },{answers:fullAnswers,hash:'#report'}));

  await finding('AUDIT-07 numeric keys outside the active question must not modify answers',()=>withPage(async page=>{
    await page.click('#start');
    await page.locator('#theme-button').focus();
    await page.keyboard.press('5');
    const progress=await page.textContent('#progress-label');
    return {safe:progress.includes('已选择 0 /'),progress};
  }));

  await finding('AUDIT-08 radar mode change should preserve keyboard focus',()=>withPage(async page=>{
    const button=page.locator('[data-radar-mode="autonomy"]');
    await button.focus();await page.keyboard.press('Enter');
    const focused=await page.evaluate(()=>({tag:document.activeElement.tagName,mode:document.activeElement.dataset.radarMode||null}));
    return {safe:focused.mode==='autonomy',focused};
  },{answers:fullAnswers,hash:'#report'}));

  const tiePoint=[0,25,75,75,50,75,75,75,50,50];
  const tieAnswers=Object.fromEntries(bank.items.filter(i=>i.status==='core').map(i=>[
    i.id,3+(tiePoint[Number(i.dimension.slice(1))-1]-50)/25*i.direction
  ]));
  await finding('REPORT-13 a close result shows candidates without automatically selecting the tie-break winner',()=>withPage(async page=>{
    await page.setViewportSize({width:390,height:844});
    const heading=await page.textContent('#ideology-heading');
    const initial=await page.locator('#radar-compare').inputValue();
    const names=await page.locator('.candidate-card h3').allTextContents();
    const rows=await page.locator('.candidate-table tbody tr').count();
    const other=page.getByRole('button',{name:'在雷达图对照社会自由主义'});
    await other.click();
    const selected=await page.locator('#radar-compare').inputValue();
    const pressed=await other.getAttribute('aria-pressed');
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
    await page.emulateMedia({media:'print'});
    const printable=await page.locator('.candidate-card h3:visible').count();
    return {safe:heading.includes('暂不归为单一标签')&&initial==='none'&&names.length===3&&rows===3&&selected==='social-liberal'&&pressed==='true'&&!overflow&&printable===3,heading,initial,names,rows,selected,pressed,overflow,printable};
  },{answers:tieAnswers,hash:'#report'}));

  await finding('VERSION-14 revised items never reuse the old questionnaire save',()=>withPage(async page=>{
    const old='{"version":"2.1.0-exploratory","answers":{"D2_05":4}}';
    await page.evaluate(v=>localStorage.setItem('political-values-v2-local',v),old);
    await page.reload();
    await page.waitForSelector('#start');
    const currentEmpty=await page.locator('.resume-card').count()===0;
    await page.click('#import-home');
    await page.fill('#answer-text',JSON.stringify({format:'political-values-answers',version:'2.1.0-exploratory',answers:{D2_05:4}}));
    await page.click('#confirm-import');
    const versionError=await page.textContent('#import-error');
    await page.locator('#modal button.secondary').click();
    let bankRequests=0;page.on('request',r=>{if(r.url().endsWith('/data.json'))bankRequests++;});
    await page.goto(base+'/?version=2.1');
    await page.getByRole('heading',{name:'旧版问卷已停用'}).waitFor();
    const preserved=await page.evaluate(()=>localStorage.getItem('political-values-v2-local'))===old;
    return {safe:currentEmpty&&versionError.includes('版本不符')&&preserved&&bankRequests===0,currentEmpty,versionError,preserved,bankRequests};
  }));

  await finding('VERSION-15 mismatched bank fails before any progress access',()=>withPage(async page=>{
    await page.addInitScript(()=>{window.storageReads=0;Storage.prototype.getItem=()=>{window.storageReads++;return null;};});
    await page.route('**/data.json',route=>route.fulfill({json:{...bank,version:'2.1.0-exploratory'}}));
    await page.reload();await page.getByText(/题库版本与本页不符/).waitFor();
    const reads=await page.evaluate(()=>window.storageReads);
    return {safe:reads===0&&await page.locator('#start').count()===0,reads};
  }));

  await finding('CONTROL-09 unknown dimension scores must remain insufficient (negative control)',()=>withPage(async page=>{
    // Exercise the exported classifier separately without changing its source.
    const evidence=await page.evaluate(async()=>{
      const {closestIdeology}=await import('./ideology.mjs');
      const {score}=await import('./core.mjs');
      const b=await(await fetch('./data.json')).json();
      const r=score({},b);
      return {name:closestIdeology(r).name,status:closestIdeology(r).status};
    });
    return {safe:evidence.status==='insufficient',...evidence};
  }));

  await finding('AUDIT-11 form question text must label its accessible group',()=>withPage(async page=>{
    await page.click('#start');
    const session=await page.context().newCDPSession(page);
    const {nodes}=await session.send('Accessibility.getFullAXTree');
    const groups=nodes.filter(n=>n.role?.value==='group').map(n=>n.name?.value||'');
    const firstText=await page.locator('fieldset legend').first().textContent();
    return {safe:groups.includes(firstText),groups:groups.slice(0,3),firstText};
  }));

  await finding('AUDIT-12 reset should clear in-memory answers even when website storage is blocked',()=>withPage(async page=>{
    await page.click('#start');
    await page.locator('fieldset input[value="4"]').first().check();
    await page.click('#preview-result');await page.click('#confirm-report');
    await page.click('#reset');await page.click('#confirm-reset');
    await page.waitForSelector('#start');
    const modalOpen=await page.locator('#modal').evaluate(el=>el.open);
    const reportStillPresent=await page.locator('.report').count();
    return {safe:!modalOpen&&reportStillPresent===0,modalOpen,reportStillPresent};
  },{init:()=>{Storage.prototype.removeItem=function(){throw new DOMException('blocked','SecurityError');};}}));

  await finding('AUDIT-10 app must not be embeddable by an unrelated origin (clickjacking)',()=>withPage(async(page,context)=>{
    const attacker=await context.newPage();
    let answerBankRequests=0;
    attacker.on('request',request=>{if(request.url().endsWith('/data.json'))answerBankRequests++;});
    const results=[];
    // about:blank gives the parent a different origin. Cover main, legacy and docs.
    for(const path of ['/','/legacy/v1/','/docs/计分与解释规范.html']){
      await attacker.setContent(`<iframe sandbox="allow-scripts allow-forms allow-same-origin" src="${base}${path}" width="1200" height="800"></iframe>`);
      const frame=attacker.frameLocator('iframe');
      const hidden=await frame.locator('html').evaluate(el=>el.hidden);
      const rendered=await frame.locator('#start').isVisible();
      results.push({path,hidden,rendered});
    }
    return {safe:results.every(r=>r.hidden&&!r.rendered)&&answerBankRequests===0,results,answerBankRequests,note:'Early frame guard blocks UI and initialization. HTTP frame-ancestors remains recommended on a header-capable proxy.'};
  }));
}).finally(async()=>{
  console.log('AUDIT EVIDENCE '+JSON.stringify(observations,null,2));
  await browser.close();await new Promise(r=>server.close(r));
});
