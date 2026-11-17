import {cp,mkdir,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const out=resolve(root,'_site');
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
// Explicit publish allowlist: never ship dependencies, CI state or test fixtures.
for(const name of ['index.html','security.js','styles.css','icon.svg','CNAME','.nojekyll',
  'app.js','data.json','core.mjs','adaptive.mjs','clarification.mjs','flow.mjs',
  'ideology.mjs','ideology-profiles.mjs','questionnaire-v1.zip','questionnaire-v2.zip',
  'ui','docs','legacy']){
  await cp(resolve(root,name),resolve(out,name),{recursive:true,filter:src=>!src.includes('__pycache__')&&!src.endsWith('.pyc')});
}
console.log('Built static site in _site/');
