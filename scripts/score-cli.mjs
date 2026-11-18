import {readFileSync} from 'node:fs';
import {BANK_VERSION,parseAnswers,score,markdownReport} from '../core.mjs';
import {closestIdeology} from '../ideology.mjs';
try{
  if(!process.argv[2]||process.argv.slice(3).some(arg=>arg!=='--json'))throw new Error('用法：node scripts/score-cli.mjs v2.2答案.json [--json]');
  const bank=JSON.parse(readFileSync(new URL('../data.json',import.meta.url),'utf8'));
  if(bank.version!==BANK_VERSION)throw new Error('题库版本与程序不符。');
  const answers=parseAnswers(readFileSync(process.argv[2],'utf8'),bank),result=score(answers,bank);
  console.log(process.argv.includes('--json')?JSON.stringify({...result,closest:closestIdeology(result)},null,2):markdownReport(result));
}catch(err){console.error(err.message);process.exitCode=2;}
