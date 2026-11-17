import {readFileSync} from 'node:fs';
import {parseAnswers,score,markdownReport} from '../core.mjs';
import {closestIdeology} from '../ideology.mjs';
const bank=JSON.parse(readFileSync(new URL('../data.json',import.meta.url),'utf8'));
try{
  if(!process.argv[2])throw new Error('用法：node scripts/score-cli.mjs 新版答案.json [--json]');
  const answers=parseAnswers(readFileSync(process.argv[2],'utf8'),bank),result=score(answers,bank);
  console.log(process.argv.includes('--json')?JSON.stringify({...result,closest:closestIdeology(result)},null,2):markdownReport(result));
}catch(err){console.error(err.message);process.exitCode=2;}
