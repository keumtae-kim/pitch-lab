const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
class Events{
 constructor(){this.handlers={}}
 addEventListener(type,callback){(this.handlers[type]??=[]).push(callback)}
 fire(type,event={}){for(const callback of this.handlers[type]||[])callback(event)}
}
const document=new Events();document.visibilityState='visible';
const window=new Events(),contexts=[];
class Context{
 constructor(){this.state='suspended';this.resumeCalls=0;this.closeCalls=0;contexts.push(this)}
 resume(){this.resumeCalls++;if(this.resumeOverride)return this.resumeOverride();this.state='running';return Promise.resolve()}
 close(){this.closeCalls++;this.state='closed';return Promise.resolve()}
}
window.AudioContext=Context;
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/audio-session.js'),'utf8'),{window,document,setTimeout,clearTimeout});
let pauses=0;
const session=window.PracticeAudio.create({onPause:()=>pauses++,timeoutMs:20});
const hide=()=>{document.visibilityState='hidden';document.fire('visibilitychange')};
const show=()=>{document.visibilityState='visible';document.fire('visibilitychange')};
(async()=>{
 assert.equal(contexts.length,0,'no context until a user play action');
 const first=session.get(),starting=session.ensureRunning();
 assert.equal(first.resumeCalls,1,'resume invoked synchronously within the play action');
 assert.equal(await starting,first);assert.equal(first.state,'running');
 first.state='interrupted';await session.ensureRunning();assert.equal(first.resumeCalls,2,'iOS interrupted is resumed too');
 hide();assert.equal(first.closeCalls,1);assert.equal(pauses,1);assert.throws(()=>session.get(),{name:'AbortError'});
 show();assert.equal(contexts.length,1,'foreground alone never starts sound');
 const second=await session.ensureRunning();assert.notEqual(second,first);assert.equal(second.state,'running');
 // A pending resume on the old page cannot reset or revive the new session.
 let finishOld;second.state='interrupted';second.resumeOverride=()=>new Promise(resolve=>{finishOld=resolve});
 const old=session.ensureRunning();const rejected=assert.rejects(old,{name:'AbortError'});
 assert.equal(session.ensureRunning(),old,'concurrent play actions share a pending resume');
 hide();show();const third=await session.ensureRunning();
 finishOld();await rejected;assert.equal(session.get(),third);assert.equal(third.state,'running');
 // Safari can leave resume() pending indefinitely: expire it and allow a fresh tap.
 third.state='interrupted';third.resumeOverride=()=>new Promise(()=>{});
 await assert.rejects(session.ensureRunning(),/오디오 연결/);assert.equal(third.closeCalls,1);
 const fourth=await session.ensureRunning();assert.notEqual(fourth,third);
 fourth.state='interrupted';fourth.resumeOverride=()=>Promise.reject(new Error('blocked'));
 await assert.rejects(session.ensureRunning(),/blocked/);
 const fifth=await session.ensureRunning();assert.notEqual(fifth,fourth);
 window.fire('pagehide');assert.equal(fifth.closeCalls,1);
 window.fire('pageshow',{persisted:true});assert.equal(contexts.length,5,'BFCache return does not autoplay');
 const sixth=await session.ensureRunning();assert.notEqual(sixth,fifth);
 sixth.state='closed';assert.notEqual(await session.ensureRunning(),sixth,'closed contexts can be replaced');
 console.log('Audio lifecycle: synchronous unlock, interrupted resume, fresh context after screen-off, pending-resume cancellation, timeout/retry, BFCache and no autoplay passed');
})().catch(error=>{console.error(error);process.exitCode=1});
