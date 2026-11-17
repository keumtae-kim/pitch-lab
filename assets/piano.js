/* Recorded Yamaha C5: Salamander / Alexander Holm, CC BY 3.0.
 * Attribution and source information: piano/README.txt. No external runtime CDN. */
(function(root){
 'use strict';
 const base=new URL('./piano/',document.currentScript.src);
 const anchors=[];
 for(let octave=1;octave<=7;octave++)for(const [name,offset] of [['C',0],['Ds',3],['Fs',6],['A',9]])anchors.push({midi:12*(octave+1)+offset,file:name+octave+'.mp3'});
 anchors.push({midi:108,file:'C8.mp3'});
 const contexts=new WeakMap();
 function state(ctx){if(!contexts.has(ctx))contexts.set(ctx,{buffers:new Map(),pending:new Map()});return contexts.get(ctx)}
 function anchorFor(midi){return anchors.reduce((best,item)=>Math.abs(item.midi-midi)<Math.abs(best.midi-midi)?item:best)}
 function ready(ctx,notes){const s=state(ctx);return notes.every(midi=>s.buffers.has(anchorFor(midi).midi))}
 async function load(ctx,anchor){
  const s=state(ctx),key=anchor.midi;
  if(s.buffers.has(key))return s.buffers.get(key);
  if(s.pending.has(key))return s.pending.get(key);
  const task=(async()=>{
   const response=await fetch(new URL(anchor.file,base));
   if(!response.ok)throw new Error('피아노 음원 HTTP '+response.status);
   const decoded=await ctx.decodeAudioData(await response.arrayBuffer());
   // Keep the recorded attack and decay; trim only leading silence and a long,
   // practically inaudible tail to limit decoded memory on mobile devices.
   const first=decoded.getChannelData(0),rate=decoded.sampleRate;
   let peak=0;for(let i=0;i<Math.min(first.length,rate*.4);i++)peak=Math.max(peak,Math.abs(first[i]));
   let onset=0;while(onset<Math.min(first.length,rate*.2)&&Math.abs(first[onset])<peak*.004)onset++;
   onset=Math.max(0,onset-Math.round(rate*.003));
   const length=Math.min(decoded.length-onset,Math.ceil(rate*8));
   const buffer=ctx.createBuffer(decoded.numberOfChannels,length,rate);
   let sum=0,count=0,max=0;
   for(let channel=0;channel<decoded.numberOfChannels;channel++){
    const data=decoded.getChannelData(channel).subarray(onset,onset+length);
    buffer.copyToChannel(data,channel);
    for(let i=0;i<data.length;i++)max=Math.max(max,Math.abs(data[i]));
    for(let i=Math.round(rate*.025);i<Math.min(data.length,rate*.3);i++){sum+=data[i]*data[i];count++}
   }
   const rms=Math.sqrt(sum/Math.max(count,1));
   const entry={buffer,normalization:Math.min(.88/Math.max(max,.001),.18/Math.max(rms,.001))};
   s.buffers.set(key,entry);return entry;
  })();
  s.pending.set(key,task);
  try{return await task}finally{s.pending.delete(key)}
 }
 async function prepare(ctx,notes){
  const wanted=new Map(notes.map(midi=>{const a=anchorFor(midi);return [a.midi,a]}));
  await Promise.all(Array.from(wanted.values(),a=>load(ctx,a)));
 }
 function schedule(ctx,midi,at,duration,volume=1){
  const anchor=anchorFor(midi),entry=state(ctx).buffers.get(anchor.midi);
  if(!entry)throw new Error('피아노 음원을 먼저 준비해 주세요.');
  const source=ctx.createBufferSource(),gain=ctx.createGain();
  const ratio=2**((midi-anchor.midi)/12),start=Math.max(ctx.currentTime,at);
  const durationLimit=entry.buffer.duration/ratio;
  const seconds=Math.max(.08,Math.min(duration??durationLimit,durationLimit));
  source.buffer=entry.buffer;source.playbackRate.setValueAtTime(ratio,start);
  gain.gain.setValueAtTime(Math.max(.00001,Math.min(1,volume)*entry.normalization),start);
  gain.gain.setTargetAtTime(.00001,start+seconds, .025);
  source.connect(gain);gain.connect(ctx.destination);
  source.onended=()=>{source.disconnect();gain.disconnect()};
  source.start(start);source.stop(start+seconds+.16);
  return {gain,oscs:[source]};
 }
 root.SamplePiano=Object.freeze({prepare,ready,schedule});
})(window);
