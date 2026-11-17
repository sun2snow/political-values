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

const {chromium}=await import(process.env.AUDIT_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.AUDIT_PLAYWRIGHT_MODULE).href : 'playwright');
const root=resolve(process.env.SITE_ROOT||fileURLToPath(new URL('../',import.meta.url)));
const bank=JSON.parse(await readFile(new URL('../data.json',import.meta.url),'utf8'));
const KEY='political-values-v2-local';
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
