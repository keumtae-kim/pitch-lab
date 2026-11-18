/* Foreground-only Web Audio. Rebuild after lock/background instead of retaining
 * a potentially stuck iOS AudioContext; never resume sound without a play action. */
(function(root){
 'use strict';
 function create({onPause=()=>{},timeoutMs=1500}={}){
  let context=null,pending=null,generation=0;
  const cancelled=()=>Object.assign(new Error('오디오 재생이 중단되었습니다.'),{name:'AbortError'});
  function reset(){
   const previous=context;context=null;pending=null;generation++;
   try{onPause()}finally{if(previous&&previous.state!=='closed'){try{Promise.resolve(previous.close()).catch(()=>{})}catch(error){}}}
  }
  function get(){
   if(document.visibilityState==='hidden')throw cancelled();
   if(!context||context.state==='closed'){
    context=new(root.AudioContext||root.webkitAudioContext)();pending=null;generation++;
   }
   return context;
  }
  function ensureRunning(){
   const current=get(),version=generation;
   if(current.state==='running')return Promise.resolve(current);
   if(pending)return pending;
   let timer;
   // Invoke resume synchronously in the originating tap/click, before awaiting.
   let request;try{request=current.resume()}catch(error){request=Promise.reject(error)}
   const task=Promise.race([
    request,
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('오디오 연결을 다시 시도해 주세요.')),timeoutMs)})
   ]).then(()=>{
    if(current!==context||version!==generation)throw cancelled();
    if(current.state!=='running')throw new Error('소리를 다시 눌러 연결해 주세요.');
    return current;
   }).catch(error=>{
    if(current===context&&version===generation)reset();
    throw error;
   }).finally(()=>{clearTimeout(timer);if(pending===task)pending=null});
   pending=task;return task;
  }
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')reset()});
  root.addEventListener('pagehide',reset);
  root.addEventListener('pageshow',event=>{if(event.persisted)reset()});
  return Object.freeze({get,ensureRunning});
 }
 root.PracticeAudio=Object.freeze({create});
})(window);
