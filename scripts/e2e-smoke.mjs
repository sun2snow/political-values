import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

const port=8779;
const server=spawn('python3',['-m','http.server',String(port),'--directory','.','--bind','127.0.0.1'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,800));

const errors=[];
let browser;
try{
  browser=await chromium.launch();
  const context=await browser.newContext({viewport:{width:1280,height:800}});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(`pageerror: ${e.message}`));
  page.on('console',msg=>{if(msg.type()==='error')errors.push(`console.error: ${msg.text()}`);});

  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  assert.match(await page.textContent('h1'),/理解立场/);

  // Theme toggle
  await page.click('#theme-button');
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
  await page.click('#theme-button');
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');

  // 24-profile catalog modal
  await page.click('#profiles-button');
  assert.equal(await page.locator('.catalog-card').count(),24);
  await page.click('[data-family="生态政治"]');
  assert.equal(await page.locator('.catalog-card').count(),4);
  await page.click('#modal button.secondary');

  // Start quiz & test hash + keyboard shortcut + dot focus preservation
  await page.click('#start');
  assert.equal(await page.evaluate(()=>location.hash),'#quiz/base-0');
  await page.click('fieldset[data-qid] input[value="4"]');
  assert.match(await page.textContent('#progress-label'),/1 \/ 96/);
  await page.keyboard.press('j');
  const secondDotActive=await page.locator('.page-dot').nth(1).evaluate(el=>el.classList.contains('is-current'));
  assert.equal(secondDotActive,true);

  // Import synthetic answers triggering supplemental + report + 3 radar modes + selected vertex persistence + item breakdown jump
  const bank=JSON.parse(readFileSync(new URL('../data.json',import.meta.url),'utf8'));
  const base=bank.items.filter(i=>i.status==='core');
  const targets=[25,25,75,75,50,75,75,50,75,25];
  const answers={};
  for(const item of base){
    const z=(targets[Number(item.dimension.slice(1))-1]-50)/25;
    answers[item.id]=3+z*item.direction;
  }
  base.filter(i=>i.dimension==='D1').forEach((item,idx)=>{
    answers[item.id]=3+(idx%2===0?2:-2)*item.direction;
  });
  Object.assign(answers,{D1_09:5,D1_10:1,D1_11:5,D1_12:1});
  const envelope={format:'political-values-answers',version:bank.version,answers,clarifications:{}};

  await page.click('#overview');
  await page.click('#nav-import');
  await page.fill('#answer-text',JSON.stringify(envelope));
  await page.click('#confirm-import');
  await page.click('#preview-result');
  await page.click('#confirm-report');
  assert.equal(await page.evaluate(()=>location.hash),'#report');

  // Test 3 radar modes & preserved vertex readout across mode switch
  await page.click('[data-radar-mode="autonomy"]');
  await page.locator('.radar-vertex[data-dim-index="0"]').click();
  assert.match(await page.textContent('#radar-readout'),/个人承担 \(反\)：图上位置/);
  await page.click('[data-radar-mode="intensity"]');
  assert.match(await page.textContent('#radar-readout'),/经济分配：鲜明度/);
  assert.equal(await page.locator('.legend-dot').count(),3);

  await page.locator('.dim-items-details summary').first().click();
  await page.locator('[data-edit-qid="D1_01"]').click();
  assert.equal(await page.evaluate(()=>location.hash.startsWith('#quiz/')),true);

  // Modal open during browser Back must close automatically
  await page.click('#overview');
  assert.equal(await page.evaluate(()=>document.querySelector('#modal').open),true);
  await page.goBack();
  assert.equal(await page.evaluate(()=>location.hash),'#report');
  assert.equal(await page.evaluate(()=>document.querySelector('#modal').open),false);

  // Centrist clarification flow + localStorage persistence across reload
  const neutral=Object.fromEntries(base.map(i=>[i.id,3]));
  const neutralEnv={format:'political-values-answers',version:bank.version,answers:neutral,clarifications:{}};
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.click('#import-home');
  await page.fill('#answer-text',JSON.stringify(neutralEnv));
  await page.click('#confirm-import');
  await page.click('#remember');
  await page.click('#preview-result');
  assert.equal(await page.evaluate(()=>location.hash),'#quiz/clarify-0');
  await page.click('#preview-result');
  await page.click('#confirm-report');
  assert.match(await page.textContent('#ideology-heading'),/暂不能确定最贴近的意识形态/);

  await page.reload({waitUntil:'networkidle'});
  assert.match(await page.textContent('.resume-card'),/80 \/ 106/);

  // Mobile 390x844 overflow check
  await page.setViewportSize({width:390,height:844});
  await page.click('#existing-result');
  await page.click('#preview-result');
  await page.click('#confirm-report');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  assert.equal(overflow,false,'mobile 390x844 horizontal overflow');

  // Verify docs HTML loads cleanly
  await page.goto(`http://127.0.0.1:${port}/docs/%E6%9C%80%E8%B4%B4%E8%BF%91%E6%84%8F%E8%AF%86%E5%BD%A2%E6%80%81%E8%A7%84%E5%88%99.html`,{waitUntil:'networkidle'});
  assert.match(await page.textContent('h1'),/最贴近的意识形态/);

  assert.deepEqual(errors,[],'unexpected browser console/page errors');
  console.log('E2E smoke checks passed!');
}finally{
  await browser?.close();
  server.kill();
}
