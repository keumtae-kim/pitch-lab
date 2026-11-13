document.title=SCORE_SONG.title+' · 음정 트레이너';
document.querySelector('header h1').textContent=SCORE_SONG.title+' · 음정 트레이너';
document.querySelector('#practice-nav span').textContent=SCORE_SONG.title;
const other=SCORE_SONG.id==='aloha'?{href:'./bom.html',label:'봄봄봄 →'}:{href:'./aloha.html',label:'아로하 →'};
const nextSong=document.querySelector('#practice-nav a:last-child');nextSong.href=other.href;nextSong.textContent=other.label;
document.querySelector('.song-key-tempo').textContent=SCORE_SONG.key+'장조 · ♩='+SCORE_SONG.bpm;
document.querySelector('#phraseTempo option[selected]').value=SCORE_SONG.bpm;document.querySelector('#phraseTempo option[selected]').textContent='원곡 · '+SCORE_SONG.bpm;

const baseNotes=SCORE_SONG.notes.map(n=>({...n,row:0}));

let rows=[];
const $=id=>document.getElementById(id);
const NAMES=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
// v8: transcribed syllables from the supplied sheet; users can correct any misalignment.
const defaultLyrics=Object.fromEntries(SCORE_SONG.notes.filter(n=>n.lyric).map(n=>[n.id,n.lyric]));
const LYRIC_SAVE_KEY=SCORE_SONG.id==='aloha'?'aloha_purchased_melody_v2_lyrics':'bombombom_pitch_trainer_purchased_v2_lyrics';
let lyricChanges={};
try { const saved=JSON.parse(localStorage.getItem(LYRIC_SAVE_KEY)||'{}'); if(saved&&typeof saved==='object'&&!Array.isArray(saved))lyricChanges=saved; }catch(e){}
function getLyric(n){const key=String(n.id);return Object.prototype.hasOwnProperty.call(lyricChanges,key)?lyricChanges[key]:(defaultLyrics[key]||'');}
function saveLyrics(){try{localStorage.setItem(LYRIC_SAVE_KEY,JSON.stringify(lyricChanges));}catch(e){}}
let notes=baseNotes.map(n=>({...n})); let current=SCORE_SONG.vocalStart,quickAnchor=SCORE_SONG.vocalStart,shift=0,octave=-SCORE_SONG.writtenOctaveOffset, ctx=null, track=null, media=null, analyzer=null, raf=null;
let successSince=0, lastAdvance=0, lastDetected=null;

const midiName=m=>NAMES[((m%12)+12)%12]+(Math.floor(m/12)-1);
const freq=m=>440*Math.pow(2,(m-69)/12);
$('oct').value=String(octave);
function note(){return notes[current]}
function targetMidi(){return note().midi+shift+octave}
// v5: locally generated reference tones. Timbres do not change MIDI pitch.
function scheduleSynthTone(midi,at,dur){
 const voice=$('soundStyle').value;
 const fundamental=freq(midi);
 const options={
  piano:{partials:[['sine',1,1],['sine',2,.28],['sine',3,.09]],level:.17},
  classic:{partials:[['triangle',1,1],['sine',2,.12]],level:.145},
  sine:{partials:[['sine',1,1]],level:.145},
  organ:{partials:[['sine',1,1],['sine',2,.30],['sine',3,.12]],level:.135}
 };
 const spec=options[voice]||options.classic;
 const output=ctx.createGain();output.connect(ctx.destination);
 const end=at+Math.max(.11,dur);
 if(voice==='piano'){
  const attack=Math.min(.012,dur*.12);
  output.gain.setValueAtTime(.0001,at);
  output.gain.linearRampToValueAtTime(spec.level,at+attack);
  // A struck, decaying note; it is a synthesized piano-like tone, not a sampled piano.
  const mid=at+Math.min(dur*.48,.45);
  output.gain.exponentialRampToValueAtTime(spec.level*.34,Math.max(at+attack+.001,mid));
  output.gain.exponentialRampToValueAtTime(.0001,end);
 }else{
  const attack=Math.min(.027,dur*.14),release=Math.min(.13,dur*.27);
  output.gain.setValueAtTime(.0001,at);
  output.gain.linearRampToValueAtTime(spec.level,at+attack);
  output.gain.setValueAtTime(spec.level*.85,Math.max(at+attack+.001,end-release));
  output.gain.exponentialRampToValueAtTime(.0001,end);
 }
 const oscs=[];
 for(const [type,mult,weight] of spec.partials){
  const osc=ctx.createOscillator(),gain=ctx.createGain();
  osc.type=type;osc.frequency.setValueAtTime(fundamental*mult,at);
  gain.gain.value=weight;
  osc.connect(gain);gain.connect(output);
  osc.start(at);osc.stop(end+.03);oscs.push(osc);
 }
 return {gain:output,oscs};
}
function playTone(midi,ms=850){
 try{
  ctx=ctx||new(window.AudioContext||window.webkitAudioContext)();
  ctx.resume();scheduleSynthTone(midi,ctx.currentTime+.008,Math.max(.14,ms/1000));
 }catch(e){$('micMsg').textContent='소리 재생 실패: '+e.message}
}
function render(){if(!notes.length)return;refreshScoreLayout();const n=note();updateScorePaging();document.querySelector('.song-key-tempo').textContent=transposedKey(SCORE_SONG.key,shift)+'장조 · ♩='+SCORE_SONG.bpm;$('shiftName').textContent=shift===0?'원키':(shift>0?'+':'')+shift;$('noteName').textContent=midiName(targetMidi());$('selectedLyric').textContent=getLyric(n)||'가사 미지정 · 이어 부름';$('lyricEditLabel').textContent=`${current+1}번 ${midiName(targetMidi())} 가사`;if(document.activeElement!==$('lyricInput'))$('lyricInput').value=getLyric(n);$('noteDesc').textContent=`악보 ${midiName(n.midi)} → 현재 ${midiName(targetMidi())} · ${freq(targetMidi()).toFixed(1)} Hz`;$('lineTitle').textContent=rows[n.row].label;$('progressTxt').textContent=`${current+1} / ${notes.length}음 · ${n.row+1}번째 악보 줄`;$('progress').style.width=`${100*(current+1)/notes.length}%`;$('dockNote').textContent=`${midiName(targetMidi())} · ${current+1}/${notes.length}음`;$('prev').disabled=current===0;$('next').disabled=current===notes.length-1;drawStaff();renderStrip();successSince=0;updatePhraseUI();}
const nativeScore=new ScoreRenderer(SCORE_SONG),nativeAnchors=new Map();let scoreLayoutKey='';
function refreshScoreLayout(){
 const available=Math.max(250,Math.floor(document.querySelector('.scoreStacks').clientWidth-12));
 const key=available+'/'+shift+'/'+notes.map(n=>n.id+':'+n.midi+':'+getLyric(n)).join('|');
 if(key!==scoreLayoutKey){
  const anchor=rows[viewRow]?.noteIds[0]??note().id;
  const layout=nativeScore.layout(available,notes,getLyric,shift);rows=layout.systems;
  viewRow=layout.noteRows.get(anchor)??0;scoreLayoutKey=key;nativeAnchors.clear();
 }
 for(const n of notes)n.row=nativeScore.plan.noteRows.get(n.id)??0;
}
let scoreResizeFrame;
const scoreResizeObserver=new ResizeObserver(()=>{cancelAnimationFrame(scoreResizeFrame);scoreResizeFrame=requestAnimationFrame(()=>{if(!scoreLayoutKey)return;const previous=scoreLayoutKey;refreshScoreLayout();if(previous!==scoreLayoutKey)render();});});
scoreResizeObserver.observe(document.querySelector('.scoreStacks'));
for(const section of SCORE_SONG.sections){const option=document.createElement('option');option.value=String(section.noteId);option.textContent=section.label;$('scoreSection').append(option);}
$('scoreSection').onchange=e=>{const id=Number(e.target.value),row=nativeScore.plan.noteRows.get(id);if(row!==undefined){viewRow=row;render();}};

// The viewport remains independent of the current playback selection.
let viewRow=0;
const scoreSlots=[
 {box:'scoreLineMain',canvas:'staff',strip:'strip',label:'scoreMainLabel',count:'scoreMainCount'},
 {box:'scoreLinePreview',canvas:'staffNext',strip:'stripNext',label:'scoreNextLabel',count:'scoreNextCount'},
 {box:'scoreLine3',canvas:'staff3',strip:'strip3',label:'scoreLabel3',count:'scoreCount3'},
 {box:'scoreLine4',canvas:'staff4',strip:'strip4',label:'scoreLabel4',count:'scoreCount4'}
];
const scoreViewKey='vocal_practice_score_view_v1';
try{const saved=JSON.parse(localStorage.getItem(scoreViewKey)||'{}');if(saved.lines===4)$('scoreLineCount').value='4';if(saved.buttons===false)$('scoreNoteButtons').checked=false;}catch(e){}
function scoreViewCount(){return $('scoreLineCount').value==='4'?4:2;}
function applyScoreView(){
 refreshScoreLayout();
 const count=scoreViewCount();
 document.querySelector('.scoreStacks').dataset.lines=String(count);
 document.querySelector('.scoreStacks').classList.toggle('hide-note-buttons',!$('scoreNoteButtons').checked);
 try{localStorage.setItem(scoreViewKey,JSON.stringify({lines:count,buttons:$('scoreNoteButtons').checked}));}catch(e){}
 updateScorePaging();drawStaff();renderStrip();
}
$('scoreLineCount').addEventListener('change',applyScoreView);
$('scoreNoteButtons').addEventListener('change',applyScoreView);
function availableScoreRows(){return rows.map((_,i)=>i);}
function shownScoreRows(){
 const available=availableScoreRows();
 let index=available.indexOf(viewRow);
 if(index<0){index=0;viewRow=available[0];}
 const visible=available.slice(index,index+scoreViewCount());
 return {main:visible[0],next:visible[1]??null,visible,index,total:available.length};
}
function ensureNoteRowVisible(row){
 if(!shownScoreRows().visible.includes(row))viewRow=row;
}
function updateScorePaging(){
 if(!notes.length)return;
 const {visible,index,total}=shownScoreRows();
 $('scorePageTitle').textContent=visible.length>1?`악보 ${index+1}~${index+visible.length} / ${total}`:`악보 ${index+1} / ${total}`;
 scoreSlots.forEach((slot,i)=>{
  const row=visible[i]??null;
  $(slot.box).hidden=row===null;$(slot.box).classList.toggle('isHidden',row===null);
  if(row===null)return;
  $(slot.label).textContent=rows[row].label+' · '+rows[row].firstMeasure+'~'+rows[row].lastMeasure+'마디';
  $(slot.count).textContent=`${notes.filter(n=>n.row===row).length}음`;
  $(slot.strip).setAttribute('aria-label',`${row+1}번째 악보 줄의 음이름과 가사`);
 });
 const shown=rows[visible[0]];if(shown){const model=notes.find(n=>n.id===shown.noteIds[0]);if(model)$('scoreSection').value=String(SCORE_SONG.sections[model.sourceSection].noteId);}
 $('scorePrev').disabled=index<=0;
 $('scoreNext').disabled=index>=total-1;
}
function jumpScoreRow(direction){
 if(!notes.length)return;
 const rows=availableScoreRows(),ix=rows.indexOf(viewRow);
 const nextIndex=Math.max(0,Math.min(rows.length-1,ix+direction));
 if(ix===nextIndex)return;
 viewRow=rows[nextIndex];
 updateScorePaging();drawStaff();renderStrip();
}
$('scorePrev').onclick=()=>jumpScoreRow(-1);
$('scoreNext').onclick=()=>jumpScoreRow(1);
// Project score anchors onto a row of bounded-width, non-overlapping buttons.
function fitNoteButtons(anchors,minimumWidths,availableWidth){
 const gap=2,count=anchors.length;
 if(!count)return {left:[],width:[],trackWidth:availableWidth};
 const minimum=minimumWidths.reduce((sum,w)=>sum+w,0),gaps=gap*(count-1);
 const preferred=minimumWidths.map(w=>Math.max(w,36));
 const extra=preferred.reduce((sum,w,i)=>sum+w-minimumWidths[i],0);
 const fraction=extra?Math.max(0,Math.min(1,(availableWidth-gaps-minimum)/extra)):0;
 const width=minimumWidths.map((w,i)=>w+fraction*(preferred[i]-w));
 const total=width.reduce((a,b)=>a+b,0)+gaps,trackWidth=Math.max(availableWidth,total),slack=trackWidth-total;
 const prefix=[];let offset=0;
 for(const w of width){prefix.push(offset);offset+=w+gap;}
 const blocks=[];
 for(let i=0;i<count;i++){
  blocks.push({first:i,last:i,sum:anchors[i]*trackWidth-width[i]/2-prefix[i],count:1});
  while(blocks.length>1){
   const right=blocks[blocks.length-1],left=blocks[blocks.length-2];
   if(left.sum/left.count<=right.sum/right.count)break;
   blocks.splice(-2,2,{first:left.first,last:right.last,sum:left.sum+right.sum,count:left.count+right.count});
  }
 }
 const left=[];
 for(const block of blocks){const shift=Math.max(0,Math.min(slack,block.sum/block.count));for(let i=block.first;i<=block.last;i++)left[i]=prefix[i]+shift;}
 return {left,width,trackWidth};
}
const noteButtonMeasure=document.createElement('canvas').getContext('2d');
function layoutNoteStrip(list){
 const available=list.clientWidth;if(!available)return;
 const buttons=[...list.querySelectorAll('.token')];
 const measure=element=>{const style=getComputedStyle(element);noteButtonMeasure.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;return noteButtonMeasure.measureText(element.textContent).width;};
 const touch=window.matchMedia('(max-width:600px)').matches;
 const minimum=buttons.map(b=>Math.max(touch?34:28,Math.ceil(Math.max(measure(b.querySelector('b')),measure(b.querySelector('.lyric'))))+8));
 const anchors=buttons.map(b=>Number(b.dataset.scoreX));
 const layout=fitNoteButtons(anchors,minimum,available);
 list.classList.toggle('is-scrollable',layout.trackWidth>available+.5);
 buttons.forEach((b,i)=>{b.style.setProperty('--button-left',`${layout.left[i]}px`);b.style.setProperty('--button-width',`${layout.width[i]}px`);});
}
const noteStripResizeObserver=new ResizeObserver(entries=>entries.forEach(entry=>layoutNoteStrip(entry.target)));
scoreSlots.forEach(slot=>noteStripResizeObserver.observe($(slot.strip)));

function renderStrip(){
 const {visible}=shownScoreRows();
 const range=quickRange();
 function fillStrip(stripId,row){
  const list=$(stripId);list.innerHTML='';if(row===null)return;
  const rowNotes=notes.map((n,i)=>({n,i})).filter(({n})=>n.row===row);
  rowNotes.forEach(({n,i},index)=>{
   const anchor=nativeAnchors.get(n.id);
   const x=anchor?anchor.x/anchor.width:.5;
   const b=document.createElement('button'),isStart=i===range.start,isEnd=i===range.end,inRange=i>=range.start&&i<=range.end;
   const isPlaying=phrasePlaying&&activePlayback&&playbackNote===i;
   b.type='button';b.className='token'+(i===current?' sel':'')+(i===quickAnchor?' anchor':'')+(inRange?' inRange':'')+(isStart?' rangeStart':'')+(isEnd?' rangeEnd':'')+(isPlaying?' nowPlaying':'');
   b.dataset.scoreX=String(x);
   const lyric=getLyric(n);
   b.title=`${i+1}번 ${midiName(n.midi+shift+octave)} · ${lyric||'가사 없음/연장'}${isStart?' · 재생 시작':''}${isEnd?' · 재생 끝':''}${isPlaying?' · 지금 재생 중':''}`;
   if(isPlaying)b.setAttribute('aria-current','true');
   const num=document.createElement('span');num.className='num';num.textContent=String(i+1);b.appendChild(num);
   const pitch=document.createElement('b');pitch.textContent=n.kind==='spoken'?'말':midiName(n.midi+shift+octave);b.appendChild(pitch);
   const lyricEl=document.createElement('span');lyricEl.className='lyric'+(lyric?'':' empty');lyricEl.textContent=lyric||'—';b.appendChild(lyricEl);
   if(isStart||isEnd){const marker=document.createElement('span');marker.className='rangeBadge '+(isStart&&isEnd?'both':isStart?'start':'end');marker.textContent=isStart&&isEnd?'시작·끝':isStart?'▶ 시작':'■ 끝';b.appendChild(marker);}
   b.onclick=()=>pickRangeNote(i);
   b.oncontextmenu=e=>{e.preventDefault();setQuickEnd(i);};
   b.onkeydown=e=>{if(e.shiftKey&&(e.key==='Enter'||e.key===' ')){e.preventDefault();setQuickEnd(i);}};
   list.appendChild(b);
  });
  layoutNoteStrip(list);
  let el=list.querySelector('.nowPlaying')||list.querySelector('.sel');
  if(el){const desired=el.offsetLeft-(list.clientWidth-el.offsetWidth)/2;list.scrollLeft=Math.max(0,Math.min(list.scrollWidth-list.clientWidth,desired));}
 }
 scoreSlots.forEach((slot,i)=>fillStrip(slot.strip,visible[i]??null));
}
function go(i,withSound=false,fromPhrase=false){
 if(i<0||i>=notes.length)return;
 if(!fromPhrase&&phrasePlaying)stopPhrase('구간 재생을 중지하고 음표를 선택했습니다.');
 if(!fromPhrase)quickAnchor=i;
 current=i;
 ensureNoteRowVisible(notes[i].row);
 $('lyricInput').value=getLyric(notes[i]);render();if(withSound&&note().kind!=='spoken')playTone(targetMidi());
}
function drawStaff(){
 refreshScoreLayout();
 const range=quickRange(),visible=shownScoreRows().visible;
 visible.forEach((row,i)=>{
  const slot=scoreSlots[i],host=$(slot.canvas),system=rows[row];
  const result=nativeScore.render(host,system,{notes,lyric:getLyric,shift,octave,currentId:note().id,startId:notes[range.start].id,endId:notes[range.end].id,playingId:phrasePlaying?notes[playbackNote]?.id:null,onPick:(id,end)=>{const ix=notes.findIndex(n=>n.id===id);if(end)setQuickEnd(ix);else pickRangeNote(ix);}});
  $(slot.box).style.setProperty('--system-width',result.width+'px');
  for(const [id,anchor] of result.anchors){nativeAnchors.set(id,{x:anchor.x,width:result.width});}
 });
}
$('down').onclick=()=>{if(phrasePlaying)stopPhrase('키 변경으로 재생을 중지했습니다.');shift=Math.max(-12,shift-1);render()};$('up').onclick=()=>{if(phrasePlaying)stopPhrase('키 변경으로 재생을 중지했습니다.');shift=Math.min(12,shift+1);render()};$('oct').onchange=e=>{if(phrasePlaying)stopPhrase('옥타브 변경으로 재생을 중지했습니다.');octave=Number(e.target.value);render()};$('prev').onclick=()=>go(current-1,true);$('next').onclick=()=>go(current+1,true);$('play').onclick=()=>playTone(targetMidi());$('nDown').onclick=()=>{if(phrasePlaying)stopPhrase();note().midi--;render()};$('nUp').onclick=()=>{if(phrasePlaying)stopPhrase();note().midi++;render()};$('resetCorrections').onclick=()=>{if(confirm('추가/수정한 음표를 모두 초기화할까요?')){if(phrasePlaying)stopPhrase();manualPhrase=null;notes=baseNotes.map(n=>({...n}));current=0;quickAnchor=0;render()}};
// YIN pitch estimator, 75~850 Hz with silence detection
function yin(buf,rate){const rms=Math.sqrt(buf.reduce((s,x)=>s+x*x,0)/buf.length);if(rms<.012)return null;const tauMin=Math.floor(rate/850),tauMax=Math.min(Math.floor(rate/75),Math.floor(buf.length/2)-1),N=buf.length-tauMax;const diff=new Float32Array(tauMax+1);for(let t=1;t<=tauMax;t++){let sum=0;for(let j=0;j<N;j++){const d=buf[j]-buf[j+t];sum+=d*d}diff[t]=sum}let rolling=0,candidate=-1,best=1;for(let t=1;t<=tauMax;t++){rolling+=diff[t];diff[t]=rolling>0?diff[t]*t/rolling:1}for(let t=tauMin;t<=tauMax;t++){if(diff[t]<.16){while(t+1<=tauMax&&diff[t+1]<diff[t])t++;candidate=t;best=diff[t];break}}if(candidate<0){for(let t=tauMin;t<=tauMax;t++)if(diff[t]<best){best=diff[t];candidate=t}if(best>.30)return null}let refined=candidate;if(candidate>1&&candidate<tauMax){let x0=diff[candidate-1],x1=diff[candidate],x2=diff[candidate+1],den=2*(2*x1-x0-x2);if(Math.abs(den)>1e-9)refined+=(x0-x2)/den}const hz=rate/refined;return hz>=75&&hz<=850?{hz,rms,quality:Math.max(0,1-best)}:null}
let yinBuffer=new Float32Array(4096), frames=[];
async function startMic(){try{if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw new Error('이 브라우저에서는 파일을 HTTPS/localhost에서 열어야 마이크를 사용할 수 있습니다.');media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});ctx=ctx||new(window.AudioContext||window.webkitAudioContext)();await ctx.resume();analyzer=ctx.createAnalyser();analyzer.fftSize=4096;const source=ctx.createMediaStreamSource(media);source.connect(analyzer);$('micStart').disabled=true;$('micStop').disabled=false;$('micMsg').textContent='마이크 켜짐 · 기준음을 듣고 편하게 따라 불러보세요.';loop()}catch(e){$('micMsg').textContent='마이크를 켤 수 없습니다: '+e.message}}
let lastSample=0;
function loop(ts=0){if(!analyzer)return;raf=requestAnimationFrame(loop);if(ts-lastSample<100)return;lastSample=ts;analyzer.getFloatTimeDomainData(yinBuffer);const result=yin(yinBuffer,ctx.sampleRate);if(!result){$('heard').textContent='—';$('confidence').textContent='소리가 감지되면 표시됩니다';$('error').textContent='— 센트';$('judge').textContent='목이 편안한 음역에서 연습하세요';successSince=0;frames=[];return}frames.push(result.hz);if(frames.length>4)frames.shift();let fs=frames.slice().sort((a,b)=>a-b),hz=fs[Math.floor(fs.length/2)],raw=69+12*Math.log2(hz/440),heardMidi=Math.round(raw),cents=1200*Math.log2(hz/freq(targetMidi()));$('heard').textContent=midiName(heardMidi);$('confidence').textContent=`${hz.toFixed(1)}Hz · 추정 정확도 ${Math.round(result.quality*100)}%`;$('error').textContent=(cents>0?'+':'')+Math.round(cents)+' 센트';$('needle').style.left=(Math.max(1,Math.min(99,50+cents/2.1)))+'%';const good=Math.abs(cents)<=Number($('tolerance').value);$('judge').textContent=good?'목표 음정에 가깝습니다':'음이 '+(cents<0?'낮습니다':'높습니다');$('judge').className=good?'sub success':'sub caution';if(good){if(!successSince)successSince=Date.now();if($('autoNext').checked&&!phrasePlaying&&Date.now()-successSince>550&&Date.now()-lastAdvance>1400){lastAdvance=Date.now();go(current+1)}}else successSince=0}
function stopMic(){if(raf)cancelAnimationFrame(raf);raf=null;if(media)media.getTracks().forEach(t=>t.stop());media=null;analyzer=null;$('micStart').disabled=false;$('micStop').disabled=true;$('micMsg').textContent='마이크 꺼짐'}
$('micStart').onclick=startMic;$('micStop').onclick=stopMic;window.addEventListener('beforeunload',stopMic);

// v4: Equal-sized, user-configurable ear-training chunks. Not the exact musical phrases.
// Each segment contains N detected score notes. Rests/lyric boundaries are not inferred.
function getPhraseLength(){
 const value=Number($('phraseLength').value);
 return Number.isFinite(value)?Math.max(1,Math.min(24,Math.round(value))):6;
}
let manualPhrase=null,phrasePlaying=false,phraseTimers=[],phraseVoices=[],phraseToken=0,activePlayback=null,playbackNote=null;
let phraseInfoMessage='구간을 재생하면 현재 음이 순서대로 강조됩니다.';
function allPhrases(){
 const result=[],length=getPhraseLength();
 for(let start=0;start<notes.length;start+=length){
  result.push({start,end:Math.min(notes.length-1,start+length-1),num:result.length+1});
 }
 return result;
}
function getPhrase(){
 if(manualPhrase){return {...manualPhrase,num:'맞춤',total:'맞춤',manual:true};}
 const ps=allPhrases();const found=ps.find(p=>current>=p.start&&current<=p.end)||ps[ps.length-1];
 return {...found,total:ps.length,manual:false};
}
function updatePhraseUI(){
 if(!notes.length)return;
 const quickActive=phrasePlaying && activePlayback?.kind==='quick';
 const p=quickActive?{start:activePlayback.from,end:activePlayback.to,manual:true}:getPhrase();
 $('phraseTitle').textContent=quickActive?'선택 음부터 연속 듣는 중':p.manual?'직접 지정한 구간':`연습 구간 ${p.num}`;
 $('phraseCount').textContent=quickActive?'선택 구간':p.manual?'맞춤 구간':`${p.num} / ${p.total}구간`;
 $('phraseInfo').textContent=`${p.start+1}~${p.end+1}번 음 · ${p.end-p.start+1}개 음표 · ${rows[notes[p.start].row].label}`;
 $('phrasePrev').disabled=!p.manual&&p.num===1;
 $('phraseNext').disabled=!p.manual&&p.num===p.total;
 $('phrasePlay').textContent=phrasePlaying?'■ 구간 재생 중지':'▶ 구간 연속 듣기';
 $('phrasePlay').setAttribute('aria-pressed',String(phrasePlaying));
 const ratio=Math.max(0,Math.min(1,(current-p.start+1)/(p.end-p.start+1)));
 $('phraseProgress').style.width=(ratio*100).toFixed(2)+'%';
 $('phraseMessage').textContent=phraseInfoMessage;
 if(manualPhrase)$('phraseMarkStatus').textContent=`직접 지정: ${manualPhrase.start+1}~${manualPhrase.end+1}번 음 (${manualPhrase.end-manualPhrase.start+1}개)`;
  else $('phraseMarkStatus').textContent=`현재는 ${getPhraseLength()}음씩 나눈 구간을 사용 중입니다.`;
 updateQuickUI();
}

const practiceWideScreen=window.matchMedia('(min-width:900px)');
function adaptLyricPanel(){ $('lyricPanel').open=false; }
adaptLyricPanel();
if(practiceWideScreen.addEventListener)practiceWideScreen.addEventListener('change',adaptLyricPanel);
else practiceWideScreen.addListener(adaptLyricPanel);
let rangePickMode='start';
function setRangePickMode(mode){
 rangePickMode=mode;
 $('rangePickStart').setAttribute('aria-pressed',String(mode==='start'));
 $('rangePickEnd').setAttribute('aria-pressed',String(mode==='end'));
}
function pickRangeNote(i){
 if(rangePickMode==='end'){setQuickEnd(i);return;}
 go(i,true);
 $('rangePickFeedback').textContent=`시작 ${i+1}번 · 끝 음표를 오른쪽 클릭해 범위를 지정하세요.`;
}
function setQuickEnd(i){
 if(i<0||i>=notes.length)return;
 if(i<quickAnchor){
  $('rangePickFeedback').textContent=`끝점은 시작점(${quickAnchor+1}번)과 같거나 뒤의 음표를 선택해 주세요. 기존 범위는 유지됩니다.`;
  return;
 }
 if(phrasePlaying)stopPhrase('재생 범위가 변경되어 재생을 중지했습니다.');
 $('quickCount').value=String(i-quickAnchor+1);
 go(i,true,true);
 setRangePickMode('start');
 $('rangePickFeedback').textContent=`${quickAnchor+1}~${i+1}번 · ${i-quickAnchor+1}음`;
}
$('rangePickStart').onclick=()=>{setRangePickMode('start');$('rangePickFeedback').textContent='시작점 선택';};
$('rangePickEnd').onclick=()=>{setRangePickMode('end');$('rangePickFeedback').textContent='끝점 선택';};
function getQuickCount(){
 const n=Number($('quickCount').value);
 return Number.isFinite(n)?Math.max(1,Math.min(notes.length,Math.round(n))):6;
}
function quickRange(){
 const start=Math.max(0,Math.min(notes.length-1,quickAnchor));
 return {start,end:Math.min(notes.length-1,start+getQuickCount()-1)};
}
function updateQuickUI(){
 if(!notes.length)return;
 $('quickCount').max=String(notes.length);
 const p=quickRange(),count=p.end-p.start+1;
 const first=midiName(notes[p.start].midi+shift+octave),last=midiName(notes[p.end].midi+shift+octave);
 const quickActive=phrasePlaying&&activePlayback?.kind==='quick';
 const preview=`${p.start+1}번 (${first})부터 ${p.end+1}번 (${last})까지 · ${count}개`;
 const trimmed=count<getQuickCount()?' · 악보 끝까지 자동 조정':'';
 $('quickRangeStatus').textContent=quickActive?`재생 중 · ${preview}`:`선택한 시작점: ${preview}${trimmed}`;
 $('quickPlay').textContent=quickActive?'■ 연속 듣기 중지':'▶ 선택 음부터 듣기';
 $('quickPlay').setAttribute('aria-pressed',String(quickActive));
 $('quickDockPlay').innerHTML=quickActive?'■ 구간<br>중지':'▶ 구간<br>듣기';
 $('quickDockPlay').setAttribute('aria-pressed',String(quickActive));
}
function changeQuickCount(value){
 const normalized=Math.max(1,Math.min(notes.length,Math.round(Number(value)||6)));
 $('quickCount').value=String(normalized);
 if(phrasePlaying)stopPhrase('재생 개수가 변경되어 재생을 중지했습니다.');
 updateQuickUI();
 drawStaff();renderStrip();
}
$('quickCount').addEventListener('change',e=>changeQuickCount(e.target.value));
$('quickCount').addEventListener('keydown',e=>{if(e.key==='Enter')e.target.blur()});
$('quickCountDown').onclick=()=>changeQuickCount(getQuickCount()-1);
$('quickCountUp').onclick=()=>changeQuickCount(getQuickCount()+1);
$('lyricInput').addEventListener('input',e=>{
 if(!notes.length)return;
 lyricChanges[String(note().id)]=e.target.value.trim();saveLyrics();
 $('selectedLyric').textContent=getLyric(note())||'가사 미지정 · 이어 부름';
 renderStrip();
});
$('lyricResetOne').onclick=()=>{
 delete lyricChanges[String(note().id)];saveLyrics();
 $('lyricInput').value=getLyric(note());
 $('selectedLyric').textContent=getLyric(note())||'가사 미지정 · 이어 부름';renderStrip();
};
$('lyricResetAll').onclick=()=>{
 if(!confirm('모든 가사 수정을 초기화하고 악보 기준 가사로 되돌릴까요?'))return;
 lyricChanges={};saveLyrics();$('lyricInput').value=getLyric(note());
 $('selectedLyric').textContent=getLyric(note())||'가사 미지정 · 이어 부름';renderStrip();
};
$('quickDockPlay').onclick=()=>{ $('quickPlay').click(); };
$('quickPlay').onclick=()=>{
 if(phrasePlaying&&activePlayback?.kind==='quick'){
  stopPhrase('선택 음부터 듣기를 중지했습니다.');
  go(quickAnchor,false,true);return;
 }
 const p=quickRange();
 playPhrase(p,'quick');
};
function stopPhrase(message){
 phraseToken++;
 phraseTimers.forEach(t=>clearTimeout(t));phraseTimers=[];
 phraseVoices.forEach(v=>{try{v.gain.gain.cancelScheduledValues(ctx.currentTime);v.gain.gain.setTargetAtTime(.00001,ctx.currentTime,.015);v.oscs.forEach(o=>o.stop(ctx.currentTime+.12))}catch(e){}});
 phraseVoices=[];
 phrasePlaying=false;activePlayback=null;playbackNote=null;
 if(message)phraseInfoMessage=message;
 updatePhraseUI();drawStaff();renderStrip();
}
function schedulePhraseTone(midi,at,dur){
 phraseVoices.push(scheduleSynthTone(midi,at,dur));
}
async function playPhrase(range=null,kind='regular'){
 stopPhrase();
 const p=range||getPhrase(),from=p.start,to=p.end;
 try{
  ctx=ctx||new(window.AudioContext||window.webkitAudioContext)();
  await ctx.resume();
 }catch(e){phraseInfoMessage='재생 불가: '+e.message;updatePhraseUI();return;}
 const token=phraseToken;
 if(token!==phraseToken)return;
 phrasePlaying=true;activePlayback={from,to,kind};playbackNote=null;phraseInfoMessage=kind==='quick'?'선택한 음부터 연속 재생 중입니다.':'구간 재생 중 · 현재 음이 순서대로 표시됩니다. 따라 부르기 전에 먼저 들어보세요.';
 // Quarter-note durations and rests transcribed from the purchased score.
 const bpm=Number($('phraseTempo').value),unit=60/bpm;
 const origin=notes[from].at||0,leadingRest=notes[from].leadRest||0;
 let elapsed=leadingRest*unit;
 go(from,false,true); // changes only the current selection, does not stop this sequence
 const startAt=ctx.currentTime+.075;
 for(let i=from;i<=to;i++){
  const n=notes[i],dur=unit*(n.beats||1);
  const onset=unit*((n.at??origin)-origin+leadingRest);
  if((i===from||!n.tied)&&n.kind!=='spoken'){
   let held=n.beats||1;
   for(let j=i+1;j<=to&&notes[j].tied;j++)held+=notes[j].beats||1;
   schedulePhraseTone(n.midi+shift+octave,startAt+onset,unit*held*.96);
  }
  const atMs=onset*1000;
  phraseTimers.push(setTimeout(()=>{
   if(token!==phraseToken)return;
   playbackNote=i;go(i,false,true);
  },Math.max(0,atMs+75)));
  elapsed=onset+dur;
 }
 updatePhraseUI();
 phraseTimers.push(setTimeout(()=>{
  if(token!==phraseToken)return;
  const repeating=$('phraseRepeat').checked;
  stopPhrase(repeating?'다시 반복합니다.':'구간 듣기가 끝났습니다. 같은 구간을 다시 듣거나 다음 구간으로 이동하세요.');
  if(repeating){phraseTimers.push(setTimeout(()=>playPhrase({start:from,end:to},kind),550));}
  else if(kind==='quick'){go(quickAnchor,false,true);updatePhraseUI();}
 },elapsed*1000+110));
}
$('phrasePlay').onclick=()=>phrasePlaying?stopPhrase('구간 재생을 중지했습니다.'):playPhrase();
$('phraseRestart').onclick=()=>playPhrase();
function jumpPhrase(direction){
 stopPhrase();
 const p=getPhrase(),all=allPhrases();
 let ix=all.findIndex(x=>x.start<=current&&current<=x.end);
 if(ix<0)ix=0;
 manualPhrase=null;
 const target=all[Math.max(0,Math.min(all.length-1,ix+direction))];
 phraseInfoMessage=`${target.num}번 구간 선택 · 구간 연속 듣기를 누르세요.`;
 go(target.start);
 updatePhraseUI();
}
$('phrasePrev').onclick=()=>jumpPhrase(-1);
$('phraseNext').onclick=()=>jumpPhrase(1);
$('phraseTempo').onchange=()=>{if(phrasePlaying&&activePlayback){const p=activePlayback;playPhrase({start:p.from,end:p.to},p.kind)}};
function changePhraseLength(next){
 const normalized=Math.max(1,Math.min(24,Math.round(Number(next)||6)));
 $('phraseLength').value=String(normalized);
 if(phrasePlaying)stopPhrase();
 manualPhrase=null; // numeric length setting switches from custom range to regular chunks
 phraseInfoMessage=`구간 길이를 ${normalized}음으로 변경했습니다. 선택된 음을 포함한 구간에서 연습합니다.`;
 updatePhraseUI();
}
$('phraseLength').addEventListener('change',e=>changePhraseLength(e.target.value));
$('phraseLength').addEventListener('keydown',e=>{
 if(e.key==='Enter'){$('phraseLength').blur();}
});
$('phraseLengthDown').onclick=()=>changePhraseLength(getPhraseLength()-1);
$('phraseLengthUp').onclick=()=>changePhraseLength(getPhraseLength()+1);
$('phraseMarkStart').onclick=()=>{
 stopPhrase();const p=getPhrase();manualPhrase={start:Math.min(current,p.end),end:p.end};
 if(manualPhrase.start>manualPhrase.end)manualPhrase.end=manualPhrase.start;
 phraseInfoMessage='시작 음을 지정했습니다. 끝 음을 선택해 끝으로 지정하세요.';updatePhraseUI();
};
$('phraseMarkEnd').onclick=()=>{
 stopPhrase();const p=getPhrase();manualPhrase={start:Math.min(p.start,current),end:current};
 phraseInfoMessage='끝 음을 지정했습니다. 범위가 맞으면 구간 연속 듣기를 누르세요.';updatePhraseUI();
};
$('phraseDefault').onclick=()=>{stopPhrase();manualPhrase=null;phraseInfoMessage='자동 구간으로 돌아왔습니다.';updatePhraseUI();};
applyScoreView();render();
$('soundStyle').addEventListener('change',()=>{
 if(phrasePlaying)stopPhrase('소리 종류를 변경했습니다. 새 소리로 구간을 다시 들어보세요.');
 playTone(targetMidi());
});
