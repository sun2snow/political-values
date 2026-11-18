import test from 'node:test';
import assert from 'node:assert/strict';
import {ProgressStore,PROGRESS_KEY,EPOCH_KEY} from '../ui/storage.mjs';

function fixture(){
  const map=new Map();
  const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};
  let queue=Promise.resolve();
  const locks={request:(_name,fn)=>{const p=queue.then(fn);queue=p.catch(()=>{});return p;}};
  const make=()=>new ProgressStore({storage:()=>storage,locks});
  return {storage,map,make,locks};
}
const payload=answers=>({version:'2.2.0-exploratory',answers,page:0,view:'quiz'});
function enable(store){const raw=store.load();if(raw)store.accept(JSON.parse(raw).answers);else store.enabled=true;}

test('SAVE-20 unaccepted bytes, including an empty string, survive normal save and reset',async()=>{
  for(const raw of ['', 'not JSON', '{"version":"old","answers":{"D1_01":5}}']){
    const {make,storage}=fixture(),s=make();storage.setItem(PROGRESS_KEY,raw);s.load();
    await s.enableSaving(payload({}));await s.save(payload({}));assert.equal(await s.clear(),false);
    assert.equal(s.protectedBackup(),raw);assert.equal(storage.getItem(EPOCH_KEY),null);
    await s.replaceProtected(payload({D1_01:3}));assert.ok(s.isSaved({D1_01:3}));assert.equal(s.protectedBackup(),null);
  }
});

test('SAVE-20 replacement is atomic and requires the same record and epoch under lock',async()=>{
  for(const mode of ['quota','changed','epoch','cancel']){
    const {make,storage}=fixture(),s=make();storage.setItem(PROGRESS_KEY,'old');s.load();
    const pending=s.replaceProtected(payload({}));
    if(mode==='quota')storage.setItem=()=>{throw new Error('quota');};
    if(mode==='changed')storage.setItem(PROGRESS_KEY,'new');
    if(mode==='epoch')storage.setItem(EPOCH_KEY,'new');
    if(mode==='cancel')s.clear();
    await pending;await s.enableSaving(payload({}));assert.equal(s.enabled,false);
    assert.equal(storage.getItem(PROGRESS_KEY),mode==='changed'?'new':'old');
    assert.equal(s.protectedBackup(),['changed','epoch'].includes(mode)?null:'old');
  }
});

test('SAVE-20 unreadable storage is not treated as empty, and revoked records cannot be downloaded',async()=>{
  const {make,storage}=fixture(),s=make();storage.setItem(PROGRESS_KEY,'raw');
  const read=storage.getItem;storage.getItem=()=>{throw new Error('denied');};assert.throws(()=>s.load());storage.getItem=read;
  await s.enableSaving(payload({}));await s.replaceProtected(payload({}));assert.equal(await s.clear(),false);assert.equal(storage.getItem(PROGRESS_KEY),'raw');
  s.load();storage.removeItem(PROGRESS_KEY);assert.equal(s.externalChange({key:PROGRESS_KEY}),'conflict');assert.equal(s.protectedBackup(),null);
});

test('successful storage and unchanged navigation writes preserve saved status',async()=>{
  const {make,storage}=fixture(),s=make();enable(s);
  await s.save(payload({D1_01:4}));
  assert.ok(s.isSaved({D1_01:4}));
  const first=storage.getItem(PROGRESS_KEY);
  await s.save({...payload({D1_01:4}),view:'report'});
  assert.equal(storage.getItem(PROGRESS_KEY),first);
  await s.save({...payload({D1_01:4}),page:3});
  assert.equal(JSON.parse(storage.getItem(PROGRESS_KEY)).page,3);
});

test('return to the committed answer while a newer write is queued saves the final choice',async()=>{
  const {storage,make}=fixture(),s=make();enable(s);
  const initial={D1_01:3};await s.save(payload(initial));
  await Promise.all([s.save(payload({D1_01:4})),s.save(payload(initial))]);
  assert.deepEqual(JSON.parse(storage.getItem(PROGRESS_KEY)).answers,initial);
  assert.ok(s.isSaved(initial));
});

test('failed save cannot be mistaken for consented-and-safely-saved progress',async()=>{
  const {make,storage}=fixture(),s=make();enable(s);
  storage.setItem=()=>{throw new Error('quota');};
  await s.save(payload({D1_01:4}));
  assert.equal(s.enabled,false);assert.equal(s.isSaved({D1_01:4}),false);
  assert.match(s.error,/无法保存/);
});

test('stale tab cannot overwrite newer answers even if storage events were missed',async()=>{
  const {make,storage}=fixture(),a=make(),b=make();enable(a);enable(b);
  await a.save(payload({D1_01:4}));
  await b.save(payload({D2_02:5}));
  assert.deepEqual(JSON.parse(storage.getItem(PROGRESS_KEY)).answers,{D1_01:4});
  assert.equal(b.enabled,false);assert.match(b.error,/另一标签页/);
});

test('opting back in verifies disk even when local answers still equal the last saved snapshot',async()=>{
  const {make,storage}=fixture(),a=make(),b=make();enable(a);await a.save(payload({D1_01:3}));enable(b);
  await a.save(payload({D1_01:4}));assert.equal(b.externalChange({key:PROGRESS_KEY}),'conflict');
  await b.enableSaving(payload({D1_01:3}));assert.equal(b.enabled,false);assert.equal(b.isSaved({D1_01:3}),false);
  assert.ok(b.needsLeaveWarning({D1_01:3}));assert.equal(JSON.parse(storage.getItem(PROGRESS_KEY)).answers.D1_01,4);
});

test('clearing the final answer protects against unload while pending or failed, not after retry succeeds',async()=>{
  const {make,storage}=fixture(),s=make();enable(s);await s.save(payload({D1_01:4}));
  const original=storage.setItem;storage.setItem=()=>{throw new Error('quota');};
  const saving=s.save(payload({}));assert.ok(s.needsLeaveWarning({}));await saving;
  assert.ok(s.needsLeaveWarning({}));assert.match(s.error,/旧答案可能仍在本机/);
  storage.setItem=original;await s.enableSaving(payload({}));assert.equal(s.needsLeaveWarning({}),false);
  assert.deepEqual(JSON.parse(storage.getItem(PROGRESS_KEY)).answers,{});
});

test('reset remains protected with empty memory until removal succeeds',async()=>{
  const {make,storage}=fixture(),s=make();enable(s);await s.save(payload({D1_01:3}));
  const original=storage.removeItem;storage.removeItem=()=>{throw new Error('blocked');};
  const clearing=s.clear();assert.equal(s.clear(),clearing);assert.equal(s.removal,'pending');assert.ok(s.needsLeaveWarning({}));
  await s.enableSaving(payload({D1_02:5}));assert.equal(await clearing,false);assert.ok(s.needsLeaveWarning({}));assert.equal(s.removal,'failed');
  storage.removeItem=original;assert.ok(await s.clear());assert.equal(s.needsLeaveWarning({}),false);assert.equal(storage.getItem(PROGRESS_KEY),null);
});

test('SAVE-20 reset cannot delete a record created or replaced while waiting for the lock',async()=>{
  for(const initial of [null,JSON.stringify(payload({D1_01:3}))]){
    const {make,storage}=fixture(),s=make();if(initial!==null)storage.setItem(PROGRESS_KEY,initial);enable(s);
    const pending=s.clear();storage.setItem(PROGRESS_KEY,'unseen');assert.equal(await pending,false);
    assert.equal(storage.getItem(PROGRESS_KEY),'unseen');assert.equal(storage.getItem(EPOCH_KEY),null);
    assert.equal(s.access,'unreadable');await s.clear();assert.equal(storage.getItem(PROGRESS_KEY),'unseen');
  }
});

test('simultaneous writers are serialized and the losing tab reports a conflict',async()=>{
  const {make,storage}=fixture(),a=make(),b=make();enable(a);enable(b);
  await Promise.all([a.save(payload({D1_01:4})),b.save(payload({D2_02:5}))]);
  assert.deepEqual(JSON.parse(storage.getItem(PROGRESS_KEY)).answers,{D1_01:4});
  assert.equal(b.enabled,false);
});

test('deletion epoch revokes missed-event tabs and survives recreation of a new archive',async()=>{
  const {make,storage}=fixture(),a=make();enable(a);await a.save(payload({D1_01:4}));
  const stale=make();enable(stale);
  await a.clear();assert.equal(storage.getItem(PROGRESS_KEY),null);assert.ok(storage.getItem(EPOCH_KEY));
  const fresh=make();enable(fresh);await fresh.save(payload({D3_01:2}));
  await stale.save(payload({D1_01:5}));
  assert.deepEqual(JSON.parse(storage.getItem(PROGRESS_KEY)).answers,{D3_01:2});
  assert.equal(stale.enabled,false);
});

test('a pending save cannot resurrect data after consent has been revoked',async()=>{
  const {make,storage}=fixture(),s=make();enable(s);
  const pending=s.save(payload({D1_01:4}));const clear=s.clear();
  await Promise.all([pending,clear]);
  assert.equal(storage.getItem(PROGRESS_KEY),null);assert.equal(s.enabled,false);
});

test('queued writes capture an immutable answer snapshot',async()=>{
  const {make,storage}=fixture(),s=make();enable(s);
  const answers={D1_01:4};const pending=s.save(payload(answers));answers.D1_01=1;
  await pending;
  assert.equal(JSON.parse(storage.getItem(PROGRESS_KEY)).answers.D1_01,4);
  assert.equal(s.isSaved(answers),false);
});

test('external deletion and update are distinguished and both revoke automatic writing',async()=>{
  const {make,storage}=fixture(),a=make();enable(a);await a.save(payload({D1_01:4}));
  const b=make();enable(b);await a.save(payload({D1_01:5}));
  assert.equal(b.externalChange({key:PROGRESS_KEY}),'conflict');assert.equal(b.enabled,false);
  const c=make();enable(c);await a.clear();
  assert.equal(c.externalChange({key:PROGRESS_KEY}),'deleted');assert.equal(c.enabled,false);
  assert.equal(c.externalChange({key:EPOCH_KEY}),null);
  assert.equal(storage.getItem(PROGRESS_KEY),null);
});

test('blocked storage removal reports failure but disables further writing',async()=>{
  const {make,storage}=fixture(),s=make();enable(s);await s.save(payload({D1_01:4}));
  storage.removeItem=()=>{throw new Error('blocked');};
  assert.equal(await s.clear(),false);assert.equal(s.enabled,false);assert.match(s.error,/无法确认/);
});

test('without Web Locks saving fails closed instead of racing other tabs',async()=>{
  const {storage}=fixture(),s=new ProgressStore({storage:()=>storage,locks:null});enable(s);
  await s.save(payload({D1_01:4}));
  assert.equal(s.enabled,false);assert.match(s.error,/多标签页/);assert.equal(storage.getItem(PROGRESS_KEY),null);
});

test('deletion remains possible without Web Locks',async()=>{
  const {storage}=fixture();storage.setItem(PROGRESS_KEY,JSON.stringify(payload({D1_01:4})));
  const s=new ProgressStore({storage:()=>storage,locks:null});enable(s);
  assert.equal(await s.clear(),true);assert.equal(storage.getItem(PROGRESS_KEY),null);
});

test('never-saved independent sessions are not cleared by other tabs',async()=>{
  const {make}=fixture(),independent=make(),writer=make();independent.load();enable(writer);
  await writer.save(payload({D1_01:4}));await writer.clear();
  assert.equal(independent.externalChange({key:EPOCH_KEY}),null);
});
