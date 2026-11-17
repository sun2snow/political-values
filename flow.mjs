import {createPages} from './adaptive.mjs';
import {score} from './core.mjs';
import {preliminaryIdeology} from './ideology.mjs';
import {clarificationPages} from './clarification.mjs';
export function questionnairePages(answers,bank){
  const pages=createPages(answers,bank);
  if(preliminaryIdeology(score(answers,bank)).id==='centrist')pages.push(...clarificationPages());
  return pages;
}
