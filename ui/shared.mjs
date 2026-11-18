export const $ = s => document.querySelector(s);
export const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const coreOptions = {'1':'非常不同意','2':'比较不同意','3':'既不赞同也不反对','4':'比较同意','5':'非常同意','U':'不了解／无法判断','Q':'题意不清'};

let toastTimer;
export function toast(text){
  const el=$('#notice');
  if(!el)return;
  el.textContent=text;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove('visible'),3800);
}

export function showModal(title, body, wide=false){
  const modal=$('#modal'), content=$('#modal-content');
  modal.classList.toggle('wide-modal', wide);
  content.onclick=null;
  content.innerHTML=`<h2 id="modal-title">${title}</h2>${body}`;
  if(!modal.open)modal.showModal();
}

export function applyDynamicStyles(){
  document.querySelectorAll('[data-position]').forEach(el=>el.style.setProperty('--position',el.dataset.position+'%'));
  document.querySelectorAll('[data-width]').forEach(el=>el.style.width=el.dataset.width+'%');
  document.querySelectorAll('[data-left]').forEach(el=>el.style.left=el.dataset.left+'%');
  document.querySelectorAll('[data-height]').forEach(el=>el.style.height=el.dataset.height+'%');
}

export function download(name, text, type){
  const blob=new Blob([text],{type}), url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('已发起下载，请查看浏览器下载列表。');
}

export function rememberMarkup(remember, saveStatusText, saveError){
  return `<label class="local-option"><input id="remember" type="checkbox" ${remember?'checked':''}><span>在此浏览器保存进度<span class="fine">（共用设备建议关闭）</span></span></label><p id="save-status" class="fine ${saveError?'save-warning':''}">${esc(saveStatusText)}</p><button type="button" class="text-button" id="retry-remove" hidden>重试删除本地存档</button><div id="protected-record" hidden><button type="button" class="text-button" id="backup-raw">下载原始存档（含原始答案）</button> <button type="button" class="text-button" id="replace-raw">用本页答案替换原始存档…</button></div>`;
}
