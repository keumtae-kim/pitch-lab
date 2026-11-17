const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.join(__dirname,'..');
for(const file of JSON.parse(fs.readFileSync(path.join(root,'assets/piano/samples.json')))){
 const data=fs.readFileSync(path.join(root,'assets/piano',file.name));
 assert.equal(data.length,file.size);
 assert.equal(crypto.createHash('sha1').update('blob '+data.length+'\0').update(data).digest('hex'),file.sha);
}
const requests=[];let failNext=false;
const sandbox={window:{},URL,document:{currentScript:{src:'https://example.test/pitch-lab/assets/piano.js?v=test'}},fetch:async url=>{
 requests.push(String(url));const ok=!failNext;failNext=false;
 return {ok,status:ok?200:503,arrayBuffer:async()=>new ArrayBuffer(2)};
}};
vm.runInNewContext(fs.readFileSync(path.join(root,'assets/piano.js'),'utf8'),sandbox);
const sampleRate=24000;
const buffer=(channels,length,rate)=>{
 const data=Array.from({length:channels},()=>new Float32Array(length));
 return {length,numberOfChannels:channels,sampleRate:rate,duration:length/rate,getChannelData:c=>data[c],copyToChannel:(v,c)=>data[c].set(v)};
};
const decoded=buffer(2,sampleRate*12,sampleRate);
for(let c=0;c<2;c++)for(let i=480;i<decoded.length;i++)decoded.getChannelData(c)[i]=.2*Math.sin((i-480)*2*Math.PI*185/sampleRate)*Math.exp(-(i-480)/sampleRate);
const param=()=>({calls:[],setValueAtTime(...v){this.calls.push(['value',...v])},setTargetAtTime(...v){this.calls.push(['target',...v])}});
const sources=[];
const ctx={currentTime:10,destination:{},decodeAudioData:async()=>decoded,createBuffer:buffer,createGain:()=>({gain:param(),connect(){},disconnect(){}}),createBufferSource:()=>{
 const source={playbackRate:param(),connect(){},disconnect(){},start(at){this.startAt=at},stop(at){this.stopAt=at}};sources.push(source);return source;
}};
(async()=>{
 const piano=sandbox.window.SamplePiano;
 assert(!piano.ready(ctx,[54]));
 await Promise.all([piano.prepare(ctx,[54,55]),piano.prepare(ctx,[55])]);
 assert.equal(requests.length,1,'concurrent notes sharing a sample fetch/decode once');
 assert(requests[0].endsWith('/pitch-lab/assets/piano/Fs3.mp3'));
 assert(piano.ready(ctx,[54,55]));
 await piano.prepare(ctx,[54]);assert.equal(requests.length,1,'cached note needs no request');
 const voice=piano.schedule(ctx,55,12,.6,.6),source=sources.at(-1);
 assert.equal(source.startAt,12);
 assert(Math.abs(source.playbackRate.calls[0][1]-2**(1/12))<1e-10,'exact semitone rate');
 assert.equal(source.buffer.duration,8,'decoded mobile cache is limited to eight seconds');
 assert(Math.abs(source.stopAt-12.76)<1e-8,'note-off and release preserve timing');
 assert(voice.gain.gain.calls[0][1]>0&&voice.gain.gain.calls[0][1]<1,'normalized gain avoids clipping');
 failNext=true;await assert.rejects(piano.prepare(ctx,[60]));
 assert(!piano.ready(ctx,[60]));await piano.prepare(ctx,[60]);assert(piano.ready(ctx,[60]),'failed load is retryable');
 assert.equal(requests.length,3);
 assert.throws(()=>piano.schedule(ctx,108,10,1));
 console.log('Piano: 29 source hashes, sample reuse, exact pitch rate, envelope timing, memory cap, failed-load retry passed');
})().catch(error=>{console.error(error);process.exitCode=1});
