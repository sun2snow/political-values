// Cooperative, version-aware persistence. Every writer and deletion uses the
// same Web Lock; stale tabs can never silently replace a newer snapshot.
export const PROGRESS_KEY='political-values-v22-local';
export const EPOCH_KEY=`${PROGRESS_KEY}-epoch`;

export class ProgressStore{
  constructor({storage=()=>localStorage,locks=globalThis.navigator?.locks,onChange=()=>{},progressKey=PROGRESS_KEY}={}){
    this.storage=storage;this.locks=locks;this.onChange=onChange;
    this.progressKey=progressKey;this.epochKey=`${progressKey}-epoch`;this.lockKey=`${progressKey}-writer`;
    this.raw=null;this.epoch=null;this.signature=null;this.savedPage=null;
    this.enabled=false;this.error='';this.pending=0;this.intent=0;
    this.removal='idle';this.clearJob=null;
    // A present record cannot be written or removed until the app validates it.
    this.access='unreadable';
  }
  load(){
    const s=this.storage();
    this.epoch=s.getItem(this.epochKey);this.raw=s.getItem(this.progressKey);
    this.access=this.raw===null?'ready':'protected';
    return this.raw;
  }
  accept(answers,page=0){this.access='ready';this.signature=JSON.stringify(answers);this.savedPage=page;this.enabled=true;}
  notify(){this.onChange(this);}
  fail(message){this.enabled=false;this.error=message;this.notify();}
  get dirty(){return this.pending>0||this.removal!=='idle'||!!this.error;}
  needsLeaveWarning(answers){
    if(this.removal!=='idle')return true;
    if(Object.values(answers).some(v=>v!=null))return !this.isSaved(answers);
    // An empty draft is also a change: the previous answers may still be on disk.
    return this.pending>0||Boolean(this.error&&this.raw!==null&&this.signature!==null&&this.signature!=='{}');
  }
  enableSaving(payload){
    if(this.access!=='ready'||this.removal==='pending')return;
    this.enabled=true;
    // Never clear a conflict based on memory alone; re-check under the writer lock.
    return this.save(payload,{verify:true});
  }
  isSaved(answers){return this.enabled&&!this.dirty&&this.signature===JSON.stringify(answers);}
  async locked(fn){
    if(!this.locks?.request)throw new Error('此浏览器不支持安全的多标签页存档，请导出答案保留进度。');
    return this.locks.request(this.lockKey,fn);
  }
  // Never export a stale in-memory copy after another tab deletes/replaces it.
  protectedBackup(){
    if(this.access!=='protected')return null;
    try{if(this.matchesDisk(this.storage()))return this.raw;}catch{}
    this.invalidateProtected();return null;
  }
  matchesDisk(s){return s.getItem(this.epochKey)===this.epoch&&s.getItem(this.progressKey)===this.raw;}
  invalidateProtected(){
    this.intent++;this.access='unreadable';this.raw=null;
    this.fail('无法核对原始存档，可能已被其他标签页修改。请先导出本页答案，再刷新核对。');
  }
  replaceProtected(payload){
    if(this.access==='protected'&&!this.pending)return this.save(payload,{replace:true});
  }
  async save(payload,{verify=false,replace=false}={}){
    const allowed=replace?this.access==='protected':this.access==='ready'&&this.enabled;
    if(!allowed)return;
    payload={...payload,answers:{...payload.answers}};
    const signature=JSON.stringify(payload.answers),intent=this.intent;
    // A queued write may still replace the last committed snapshot (A → B → A).
    if(!verify&&!this.dirty&&signature===this.signature&&payload.page===this.savedPage)return;
    this.pending++;this.notify();
    try{
      await this.locked(()=>{
        if(intent!==this.intent||(!replace&&!this.enabled))return;
        const s=this.storage();
        if(!this.matchesDisk(s)){
          if(replace){this.invalidateProtected();return;}
          this.fail('另一标签页已修改或清除存档，已停止本页自动保存。请先导出本页答案，再刷新核对，避免覆盖新进度。');return;
        }
        const raw=JSON.stringify({...payload,revision:globalThis.crypto.randomUUID()});
        s.setItem(this.progressKey,raw);
        this.access='ready';this.enabled=true;
        this.raw=raw;this.signature=signature;this.savedPage=payload.page;this.error='';this.removal='idle';
      });
    }catch(err){this.fail(replace?'未能替换原始存档。请先下载备份，也可以只在本页作答。':signature==='{}'&&this.raw!==null?'清空后的答案未能保存，旧答案可能仍在本机。请重试或在浏览器设置中清除网站数据。':err.message.includes('多标签页')?err.message:'此浏览器无法保存进度。请导出答案，关闭页面前自行保留。');}
    finally{this.pending--;this.notify();}
  }
  clear(){
    if(this.access!=='ready'){this.intent++;return false;}
    if(this.clearJob)return this.clearJob;
    this.enabled=false;this.intent++;this.signature=null;this.error='';this.removal='pending';this.notify();
    this.clearJob=this.removeProgress().finally(()=>{this.clearJob=null;});
    return this.clearJob;
  }
  async removeProgress(){
    try{
      const remove=()=>{
        const s=this.storage();
        // Reset may have been queued before a different tab created a record.
        // Consent to erase our snapshot does not cover that unseen record.
        if(s.getItem(this.progressKey)!==null&&!this.matchesDisk(s)){
          this.removal='idle';this.invalidateProtected();return;
        }
        // The non-sensitive epoch revokes pending writers even if a tab misses
        // storage events or a new snapshot is created after deletion (ABA).
        let error;
        try{s.setItem(this.epochKey,globalThis.crypto.randomUUID());}catch(err){error=err;}
        try{s.removeItem(this.progressKey);}catch(err){error=err;}
        this.raw=s.getItem(this.progressKey);this.epoch=s.getItem(this.epochKey);
        if(error||this.raw!==null)throw error||new Error('delete failed');
      };
      if(this.locks?.request)await this.locked(remove);
      else remove(); // Deletion must remain possible on read-only/older browsers.
      this.removal='idle';
    }catch{this.removal='failed';this.error='无法确认本地存档已删除，旧答案可能仍在本机。请重试或在浏览器设置中清除网站数据。';}
    this.notify();
    return !this.error;
  }
  externalChange(event){
    if(event.key!==null&&event.key!==this.progressKey&&event.key!==this.epochKey)return null;
    if(this.access==='protected')return this.protectedBackup()===null?'conflict':null;
    if(!this.enabled&&this.signature===null)return null; // Unrelated, never-saved sessions stay independent.
    const s=this.storage();
    const raw=s.getItem(this.progressKey),epoch=s.getItem(this.epochKey);
    if(raw===this.raw&&epoch===this.epoch)return null;
    const deleted=raw===null||epoch!==this.epoch;
    this.intent++;
    if(deleted){
      this.signature=null;
      // An observed empty store may later accept explicit consent again, but
      // never adopt a different tab's already-recreated snapshot as our own.
      if(raw===null){this.raw=null;this.epoch=epoch;this.savedPage=null;}
    }
    this.fail(deleted?'其他标签页已清除或撤销保存，本页已停止保存并清空答案。':'另一标签页已更新存档，本页已停止自动保存。请导出本页答案，再刷新核对。');
    return deleted?'deleted':'conflict';
  }
}
