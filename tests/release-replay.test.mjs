import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
test('REPLAY-22: archived rankings and generated v2.1 replay remain reproducible offline',()=>{
  const report=execFileSync(process.execPath,['experiments/ideology/sensitivity.mjs','--check'],{cwd:root,encoding:'utf8'});
  assert.match(report,/4 份答卷的候选名次有变化，0 份改变第一名，0 份改变前三顺序/);
  assert.match(report,/第 9 名 绿色保守主义 → 古典自由主义/);
});

test('CI-23: retain waiting jobs, then deploy only if the head query succeeds and matches',()=>{
  const workflow=readFileSync(join(root,'.github/workflows/ci.yml'),'utf8');
  const deploy=workflow.split('\n  deploy:\n')[1];
  assert.match(deploy,/    concurrency:\n      group: pages-production\n      queue: max\b/);
  assert.match(deploy,/if: steps\.freshness\.outputs\.current == 'true'/);
  const script=deploy.match(/        run: \|\n((?:          [^\n]*\n)+)/)[1];
  const temp=mkdtempSync(join(tmpdir(),'pv-ci-')),output=join(temp,'output');
  try{for(const [answer,status,current] of [['testsha',0,true],['older',0,false],['',1,false]]){
    writeFileSync(output,'');
    const p=spawnSync('bash',['-eu','-c',`gh(){ printf '%s' "$HEAD_ANSWER"; return "$GH_STATUS"; }\n${script}`],{env:{...process.env,GITHUB_REPOSITORY:'local/example',GITHUB_OUTPUT:output,GITHUB_SHA:'testsha',GH_STATUS:String(status),HEAD_ANSWER:answer}});
    assert.equal(p.status,status);assert.equal(readFileSync(output,'utf8'),current?'current=true\n':'');
  }}finally{rmSync(temp,{recursive:true,force:true});}
});
