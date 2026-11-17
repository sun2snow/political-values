// Cooperative, version-aware persistence. Every writer and deletion uses the
// same Web Lock; stale tabs can never silently replace a newer snapshot.
export const PROGRESS_KEY='political-values-v2-local';
export const EPOCH_KEY=`${PROGRESS_KEY}-epoch`;
const LOCK=`${PROGRESS_KEY}-writer`;

export class ProgressStore{
  constructor({storage=()=>localStorage,locks=globalThis.navigator?.locks,onChange=()=>{}}={}){
    this.storage=storage;this.locks=locks;this.onChange=onChange;
    this.raw=null;this.epoch=null;this.signature=null;
    this.enabled=false;this.error='';this.pending=0;this.intent=0;
  }
  load(){
    const s=this.storage();
    this.epoch=s.getItem(EPOCH_KEY);this.raw=s.getItem(PROGRESS_KEY);
    return this.raw;
  }
  accept(answers){this.signature=JSON.stringify(answers);this.enabled=true;}
  notify(){this.onChange(this);}
  fail(message){this.enabled=false;this.error=message;this.notify();}
  get dirty(){return this.pending>0||!!this.error;}
  isSaved(answers){return this.enabled&&!this.dirty&&this.signature===JSON.stringify(answers);}
  async locked(fn){
    if(!this.locks?.request)throw new Error('此浏览器不支持安全的多标签页存档，请导出答案保留进度。');
    return this.locks.request(LOCK,fn);
  }
  async save(payload){
    if(!this.enabled)return;
    payload={...payload,answers:{...payload.answers}};
    const signature=JSON.stringify(payload.answers),intent=this.intent;
    if(signature===this.signature&&!this.error)return;
    this.pending++;this.notify();
    try{
      await this.locked(()=>{
        if(!this.enabled||intent!==this.intent)return;
        const s=this.storage();
        if(s.getItem(EPOCH_KEY)!==this.epoch||s.getItem(PROGRESS_KEY)!==this.raw){
          this.fail('另一标签页已修改或清除存档，已停止本页自动保存。请先导出本页答案，再刷新核对，避免覆盖新进度。');return;
        }
        const raw=JSON.stringify({...payload,revision:globalThis.crypto.randomUUID()});
        s.setItem(PROGRESS_KEY,raw);
        this.raw=raw;this.signature=signature;this.error='';
      });
    }catch(err){this.fail(err.message.includes('多标签页')?err.message:'此浏览器无法保存进度。请导出答案，关闭页面前自行保留。');}
    finally{this.pending--;this.notify();}
  }
  async clear(){
    this.enabled=false;this.intent++;this.signature=null;this.error='';this.notify();
    try{
      const remove=()=>{
        const s=this.storage();
        // The non-sensitive epoch revokes pending writers even if a tab misses
        // storage events or a new snapshot is created after deletion (ABA).
        let error;
        try{s.setItem(EPOCH_KEY,globalThis.crypto.randomUUID());}catch(err){error=err;}
        try{s.removeItem(PROGRESS_KEY);}catch(err){error=err;}
        this.raw=s.getItem(PROGRESS_KEY);this.epoch=s.getItem(EPOCH_KEY);
        if(error||this.raw!==null)throw error||new Error('delete failed');
      };
      if(this.locks?.request)await this.locked(remove);
      else remove(); // Deletion must remain possible on read-only/older browsers.
    }catch{this.error='当前页面已停止保存；无法确认本地存档已删除，请使用浏览器的网站数据设置清除。';}
    this.notify();
    return !this.error;
  }
  externalChange(event){
    if(!this.enabled&&this.signature===null)return null; // Unrelated, never-saved sessions stay independent.
    if(event.key!==null&&event.key!==PROGRESS_KEY&&event.key!==EPOCH_KEY)return null;
    const s=this.storage();
    const raw=s.getItem(PROGRESS_KEY),epoch=s.getItem(EPOCH_KEY);
    if(raw===this.raw&&epoch===this.epoch)return null;
    const deleted=raw===null||epoch!==this.epoch;
    this.intent++;
    this.fail(deleted?'其他标签页已清除或撤销保存，本页已停止保存并清空答案。':'另一标签页已更新存档，本页已停止自动保存。请导出本页答案，再刷新核对。');
    return deleted?'deleted':'conflict';
  }
}
