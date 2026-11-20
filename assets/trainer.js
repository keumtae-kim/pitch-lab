document.title=SCORE_SONG.title+' · 음정 트레이너';
document.querySelector('header h1').textContent=SCORE_SONG.title+' · 음정 트레이너';
document.querySelector('#practice-nav span').textContent=SCORE_SONG.title;
const songCatalog=window.SCORE_CATALOG||[{id:'aloha',title:'아로하',url:'aloha.html'},{id:'bom',title:'봄봄봄',url:'bom.html'}];
const other=songCatalog[(songCatalog.findIndex(s=>s.id===SCORE_SONG.id)+1)%songCatalog.length];
const nextSong=document.querySelector('#practice-nav a:last-child');nextSong.href='./'+other.url;nextSong.textContent=other.title+' →';nextSong.title='다음 연습곡: '+other.title;
document.querySelector('.song-key-tempo').textContent=SCORE_SONG.key+'장조 · ♩='+SCORE_SONG.bpm;
document.querySelector('#phraseTempo option[selected]').value=SCORE_SONG.bpm;document.querySelector('#phraseTempo option[selected]').textContent='원곡 · '+SCORE_SONG.bpm;
if(SCORE_SONG.practiceTempos){const labels=['천천히','원곡','빠르게'];[...document.querySelector('#phraseTempo').options].forEach((option,i)=>{option.value=String(SCORE_SONG.practiceTempos[i]);option.textContent=labels[i]+' · '+SCORE_SONG.practiceTempos[i];});}

const baseNotes=SCORE_SONG.notes.map(n=>({...n,row:0}));

let rows=[];
const $=id=>document.getElementById(id);
const NAMES=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
// v8: transcribed syllables from the supplied sheet; users can correct any misalignment.
const defaultLyrics=Object.fromEntries(SCORE_SONG.notes.filter(n=>n.lyric).map(n=>[n.id,n.lyric]));
const legacyLyricKeys={aloha:'aloha_purchased_melody_v2_lyrics',bom:'bombombom_pitch_trainer_purchased_v2_lyrics'};
const LYRIC_SAVE_KEY=legacyLyricKeys[SCORE_SONG.id]||'pitch_lab_'+SCORE_SONG.id+'_lyrics_v1';
let lyricChanges={};
try { const saved=JSON.parse(localStorage.getItem(LYRIC_SAVE_KEY)||'{}'); if(saved&&typeof saved==='object'&&!Array.isArray(saved))lyricChanges=saved; }catch(e){}
function getLyric(n){const key=String(n.id);return Object.prototype.hasOwnProperty.call(lyricChanges,key)?lyricChanges[key]:(defaultLyrics[key]||'');}
function saveLyrics(){try{localStorage.setItem(LYRIC_SAVE_KEY,JSON.stringify(lyricChanges));}catch(e){}}
let notes=baseNotes.map(n=>({...n})); let current=SCORE_SONG.vocalStart,quickAnchor=SCORE_SONG.vocalStart,shift=0,octave=-SCORE_SONG.writtenOctaveOffset, ctx=null, track=null, media=null, analyzer=null, raf=null;
let successSince=0, lastAdvance=0, lastDetected=null;
const audioSession=PracticeAudio.create({onPause:pauseSongAudio});
const volumeKey='pitch_lab_song_volume_v1';
const volumeSlider=$('songVolume');
let playbackOutput=null;
try{
 const saved=localStorage.getItem(volumeKey);
 if(saved!==null)volumeSlider.value=saved;
}catch(error){}

function updateVolume(){
 const label=volumeSlider.value+'%';
 $('songVolumeValue').textContent=label;
 volumeSlider.setAttribute('aria-valuetext',label);
 if(playbackOutput)playbackOutput.gain.setTargetAtTime(volumeSlider.valueAsNumber/100,ctx.currentTime,.012);
}
volumeSlider.addEventListener('input',()=>{
 updateVolume();
 try{localStorage.setItem(volumeKey,volumeSlider.value);}catch(error){}
});
updateVolume();

function getPlaybackOutput(){
 if(playbackOutput?.context!==ctx){
  playbackOutput=ctx.createGain();
  playbackOutput.gain.value=volumeSlider.valueAsNumber/100;
  playbackOutput.connect(ctx.destination);
 }
 return playbackOutput;
}

const midiName=m=>NAMES[((m%12)+12)%12]+(Math.floor(m/12)-1);
const freq=m=>440*Math.pow(2,(m-69)/12);
function practiceMidi(n,offset=octave){return n.midi+shift+offset;}
function noteNameFor(n,offset=octave){return n.kind==='spoken'?'말':sharpNoteName(practiceMidi(n,offset));}
function scoreLabelFor(note){
 if(scoreLabelMode.value==='lyrics')return getLyric(note);
 if(scoreLabelMode.value==='pitch'||note.kind==='spoken')return noteNameFor(note);
 if(scoreLabelMode.value==='fixed-do')return fixedDoName(practiceMidi(note));
 return scaleDegreeName(note.pitch,note.midi,SCORE_SONG.key);
}

$('oct').value=String(octave);
function note(){return notes[current]}
function targetMidi(){return practiceMidi(note());}
// Recorded piano and optional electronic tones share the same MIDI pitch.
function scheduleSynthTone(midi,at,dur){
 const voice=$('soundStyle').value;
 const destination=getPlaybackOutput();
 if(voice==='piano')return SamplePiano.schedule(ctx,midi,at,dur,.72,destination);
 const fundamental=freq(midi);
 const options={
  classic:{partials:[['triangle',1,1],['sine',2,.12]],level:.145},
  sine:{partials:[['sine',1,1]],level:.145},
  organ:{partials:[['sine',1,1],['sine',2,.30],['sine',3,.12]],level:.135}
 };
 const spec=options[voice]||options.classic;
 const output=ctx.createGain();output.connect(destination);
 const end=at+Math.max(.11,dur);
 const attack=Math.min(.027,dur*.14),release=Math.min(.13,dur*.27);
 output.gain.setValueAtTime(.0001,at);
 output.gain.linearRampToValueAtTime(spec.level,at+attack);
 output.gain.setValueAtTime(spec.level*.85,Math.max(at+attack+.001,end-release));
 output.gain.exponentialRampToValueAtTime(.0001,end);
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
let singleToneId=0,singleVoice=null;
function stopSingleTone(){
 singleToneId++;
 if(singleVoice){try{const now=ctx.currentTime;singleVoice.gain.gain.cancelScheduledValues(now);singleVoice.gain.gain.setTargetAtTime(.00001,now,.015);singleVoice.oscs.forEach(source=>source.stop(now+.12))}catch(error){}singleVoice=null}
}
async function preparePiano(notes){
 if($('soundStyle').value!=='piano')return;
 const context=ctx;
 if(!SamplePiano.ready(context,notes))$('soundState').textContent='피아노 음원 준비 중…';
 try{await SamplePiano.prepare(context,notes);if(ctx===context)$('soundState').textContent='피아노 준비됨'}catch(error){if(ctx===context)$('soundState').textContent='음원 로딩 실패 · 다시 눌러주세요.';throw error}
}

async function playTone(midi,ms=850){
 if(phrasePlaying)stopPhrase();stopSingleTone();const id=singleToneId;
 try{
  ctx=audioSession.get();
  await audioSession.ensureRunning();await preparePiano([midi]);
  if(id!==singleToneId)return;
  singleVoice=scheduleSynthTone(midi,ctx.currentTime+.008,Math.max(.14,ms/1000));
 }catch(e){if(id===singleToneId)$('soundState').textContent='소리 재생 실패 · 다시 눌러주세요.'}
}
function render(){if(!notes.length)return;refreshScoreLayout();const n=note();updateScorePaging();document.querySelector('.song-key-tempo').textContent=transposedKey(SCORE_SONG.key,shift)+'장조 · ♩='+SCORE_SONG.bpm;$('shiftName').textContent=shift===0?'원키':(shift>0?'+':'')+shift;$('noteName').textContent=noteNameFor(note());$('selectedLyric').hidden=scoreLabelMode.value==='pitch';$('selectedLyric').textContent=scoreLabelFor(n)||(scoreLabelMode.value==='lyrics'?'가사 미지정 · 이어 부름':'');$('lyricEditLabel').textContent=`${current+1}번 ${noteNameFor(note())} 가사`;if(document.activeElement!==$('lyricInput'))$('lyricInput').value=getLyric(n);$('noteDesc').textContent=`악보 ${noteNameFor(n,0)} → 현재 ${noteNameFor(note())} · ${freq(targetMidi()).toFixed(1)} Hz`;$('lineTitle').textContent=rows[n.row].label;$('progressTxt').textContent=`${current+1} / ${notes.length}음 · ${n.row+1}번째 악보 줄`;$('progress').style.width=`${100*(current+1)/notes.length}%`;$('dockNote').textContent=`${noteNameFor(note())} · ${current+1}/${notes.length}음`;$('prev').disabled=current===0;$('next').disabled=current===notes.length-1;renderScore();successSince=0;updatePhraseUI();}
const nativeScore=new ScoreRenderer(SCORE_SONG);
const scoreStack=$('scoreStacks'),scoreLines=new Map();
let scoreLayoutKey='',mountedRows=[],noteIndexById=new Map();
function refreshScoreLayout(){
 const available=Math.max(160,Math.floor(scoreStack.clientWidth-12));
 const mode=scoreLabelMode.value;
 const signature=JSON.stringify([available,shift,octave,mode,notes.map(n=>[n.id,n.midi,mode==='lyrics'?getLyric(n):''])]);
 if(signature!==scoreLayoutKey){
  const anchor=rows[viewRow]?.noteIds[0]??note().id;
  const layout=nativeScore.layout(available,notes,scoreLabelFor,shift);rows=layout.systems;
  viewRow=layout.noteRows.get(anchor)??0;scoreLayoutKey=signature;
  noteIndexById=new Map(notes.map((note,index)=>[note.id,index]));
 }
 for(const n of notes)n.row=nativeScore.plan.noteRows.get(n.id)??0;
}
let scoreResizeFrame;
const scoreResizeObserver=new ResizeObserver(()=>{cancelAnimationFrame(scoreResizeFrame);scoreResizeFrame=requestAnimationFrame(()=>{if(!scoreLayoutKey)return;const previous=scoreLayoutKey;refreshScoreLayout();if(previous!==scoreLayoutKey)render();});});
scoreResizeObserver.observe(scoreStack);
for(const section of SCORE_SONG.sections){const option=document.createElement('option');option.value=String(section.noteId);option.textContent=section.label;$('scoreSection').append(option);}
$('scoreSection').onchange=e=>{
 const row=nativeScore.plan.noteRows.get(Number(e.target.value));
 if(row===undefined)return;
 viewRow=row;
 if(isFullScore())scrollToScoreRow(row,{always:true});
 else render();
};

// The score position is independent of the current playback selection.
let viewRow=0;
const scoreViewKey='vocal_practice_score_view_v1';
const scoreLabelMode=$('scoreLabelMode');
try{
 const saved=JSON.parse(localStorage.getItem(scoreViewKey)||'{}');
 if([2,4,'all'].includes(saved.lines))$('scoreLineCount').value=String(saved.lines);
 if(saved.buttons===false)$('scoreNoteButtons').checked=false;
 if([...scoreLabelMode.options].some(option=>option.value===saved.label))scoreLabelMode.value=saved.label;
}catch(error){}
function isFullScore(){return $('scoreLineCount').value==='all';}
function scoreViewCount(){return Number($('scoreLineCount').value);}
function applyScoreView(){
 refreshScoreLayout();
 const mode=$('scoreLineCount').value;
 const label=scoreLabelMode.value;
 scoreStack.dataset.lines=mode;
 scoreStack.dataset.labelMode=label;
 $('lyricPanel').hidden=label!=='lyrics';
 scoreStack.classList.toggle('hide-note-buttons',!$('scoreNoteButtons').checked);
 try{localStorage.setItem(scoreViewKey,JSON.stringify({lines:mode==='all'?mode:Number(mode),buttons:$('scoreNoteButtons').checked,label}));}catch(error){}
 render();
}
$('scoreLineCount').addEventListener('change',applyScoreView);
$('scoreNoteButtons').addEventListener('change',applyScoreView);
scoreLabelMode.addEventListener('change',applyScoreView);

function shownScoreRows(){
 if(isFullScore())return rows.map((_,index)=>index);
 const end=Math.min(viewRow+scoreViewCount(),rows.length);
 return Array.from({length:end-viewRow},(_,index)=>viewRow+index);
}
function ensureNoteRowVisible(row){
 if(isFullScore()||row<viewRow||row>=viewRow+scoreViewCount())viewRow=row;
}
function updateScorePaging(){
 if(!notes.length)return;
 const full=isFullScore(),total=rows.length;
 $('scorePaging').classList.toggle('full-score',full);
 $('scorePrev').hidden=full;
 $('scoreNext').hidden=full;
 if(full){
  $('scorePageTitle').textContent=`전체 악보 · ${total}줄`;
  return;
 }
 const end=Math.min(viewRow+scoreViewCount(),total),start=viewRow+1;
 $('scorePageTitle').textContent=start<end?`악보 ${start}~${end} / ${total}`:`악보 ${start} / ${total}`;
 const model=notes[noteIndexById.get(rows[viewRow]?.noteIds[0])];
 if(model)$('scoreSection').value=String(SCORE_SONG.sections[model.sourceSection].noteId);
 $('scorePrev').disabled=viewRow<=0;
 $('scoreNext').disabled=viewRow>=total-1;
}
function jumpScoreRow(direction){
 if(!notes.length||isFullScore())return;
 const row=Math.max(0,Math.min(rows.length-1,viewRow+direction));
 if(row===viewRow)return;
 viewRow=row;
 updateScorePaging();renderScore();
}
$('scorePrev').onclick=()=>jumpScoreRow(-1);
$('scoreNext').onclick=()=>jumpScoreRow(1);

function scrollToScoreRow(row,{always=false}={}){
 const line=scoreLines.get(row)?.box;
 if(!line)return;
 const bounds=line.getBoundingClientRect();
 const top=$('practice-nav').getBoundingClientRect().bottom+8;
 const bottom=document.querySelector('.navDock').getBoundingClientRect().top;
 if(always||bounds.top<top||bounds.bottom>bottom)window.scrollBy({top:bounds.top-top});
}
// Keep consecutive runs readable; continue lower runs near the remaining notes.
const noteButtonMeasure=document.createElement('canvas').getContext('2d');
function layoutNoteStrip(list){
 const available=list.clientWidth;if(!available)return;
 const buttons=[...list.querySelectorAll('.token')];
 const measure=element=>{const style=getComputedStyle(element);noteButtonMeasure.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;return noteButtonMeasure.measureText(element.textContent).width;};
 const touch=window.matchMedia('(max-width:600px)').matches;
 const minimum=buttons.map(b=>Math.ceil(Math.max(measure(b.querySelector('b')),measure(b.querySelector('.lyric'))))+10);
 const layout=fitNoteLanes(buttons.map(b=>Number(b.dataset.scoreX)),minimum,available,touch);
 const compact=!touch&&$('scoreLineCount').value!=='2',height=touch?44:compact?32:42,gap=touch?5:4;
 list.dataset.lanes=String(layout.runs.length);list.classList.remove('is-scrollable');
 list.style.setProperty('--note-strip-height',`${Math.max(1,layout.runs.length)*(height+gap)+3}px`);
 list.querySelectorAll('.note-continuation').forEach(el=>el.remove());
 layout.placements.forEach((p,i)=>{const b=buttons[i];b.style.setProperty('--button-left',p.left+'px');b.style.setProperty('--button-width',p.width+'px');const textScale=Math.min(1,Math.max(.65,(p.width-8)/Math.max(1,minimum[i]-10)));b.style.setProperty('--button-pitch-size',(11*textScale)+'px');b.style.setProperty('--button-lyric-size',(11*textScale)+'px');b.style.setProperty('--button-top',(3+p.row*(height+gap))+'px');b.dataset.lane=String(p.row);});
 for(let row=1;row<layout.runs.length;row++){
  const p=layout.placements[layout.runs[row].from],mark=document.createElement('span');mark.className='note-continuation';mark.textContent='';mark.setAttribute('aria-hidden','true');mark.style.left=Math.max(0,p.left-13)+'px';mark.style.top=(3+row*(height+gap))+'px';list.append(mark);
 }
}
const noteStripResizeObserver=new ResizeObserver(entries=>entries.forEach(entry=>layoutNoteStrip(entry.target)));
function createScoreLine(row){
 const box=$('scoreLineTemplate').content.firstElementChild.cloneNode(true);
 box.dataset.scoreRow=String(row);
 const staff=box.querySelector('.native-staff');
 staff.id=`score-staff-${row}`;
 return {box,staff,strip:box.querySelector('.noteStrip'),buttons:[]};
}
function mountScoreRows(visible){
 if(mountedRows.length===visible.length&&mountedRows.every((row,index)=>row===visible[index]))return;
 const wanted=new Set(visible);
 for(const [row,line] of scoreLines){
  if(wanted.has(row))continue;
  noteStripResizeObserver.unobserve(line.strip);
  scoreLines.delete(row);
 }
 scoreStack.replaceChildren(...visible.map(row=>{
  if(!scoreLines.has(row))scoreLines.set(row,createScoreLine(row));
  return scoreLines.get(row).box;
 }));
 mountedRows=visible;
}
function buildNoteButtons(line,system,rendered){
 line.buttons=system.noteIds.map(id=>{
  const index=noteIndexById.get(id),model=notes[index];
  const button=document.createElement('button');
  button.type='button';
  button.className='token';
  button.dataset.scoreX=String((rendered.anchors.get(id)?.x??rendered.width/2)/rendered.width);
  const pitch=noteNameFor(model),label=scoreLabelMode.value==='pitch'?'':scoreLabelFor(model);
  const num=document.createElement('span');num.className='num';num.textContent=String(index+1);
  const pitchLabel=document.createElement('b');pitchLabel.textContent=pitch;
  const caption=document.createElement('span');caption.className=label?'lyric':'lyric empty';caption.textContent=label||(scoreLabelMode.value==='lyrics'?'—':'');
  button.append(num,pitchLabel,caption);
  button.onclick=()=>pickRangeNote(index);
  button.oncontextmenu=event=>{event.preventDefault();setQuickEnd(index);};
  button.onkeydown=event=>{
   if(event.shiftKey&&(event.key==='Enter'||event.key===' ')){event.preventDefault();setQuickEnd(index);}
  };
  return {button,index,title:`${index+1}번 ${pitch}${label&&label!==pitch?' · '+label:''}`};
 });
 line.strip.replaceChildren(...line.buttons.map(({button})=>button));
 noteStripResizeObserver.observe(line.strip);
}

function updateNoteButtons(line,range,playing){
 for(const entry of line.buttons){
  const {button,index,title}=entry;
  const start=index===range.start,end=index===range.end,active=index===playing;
  button.classList.toggle('sel',index===current);
  button.classList.toggle('anchor',index===quickAnchor);
  button.classList.toggle('inRange',index>=range.start&&index<=range.end);
  button.classList.toggle('rangeStart',start);
  button.classList.toggle('rangeEnd',end);
  button.classList.toggle('nowPlaying',active);
  button.title=title+(start?' · 재생 시작':'')+(end?' · 재생 끝':'')+(active?' · 지금 재생 중':'');
  if(active)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');
  if(start||end){
   if(!entry.marker){
    entry.marker=document.createElement('span');
    button.append(entry.marker);
   }
   entry.marker.className='rangeBadge '+(start&&end?'both':start?'start':'end');
   entry.marker.textContent=start&&end?'시작·끝':start?'▶ 시작':'■ 끝';
  }else if(entry.marker){
   entry.marker.remove();entry.marker=null;
  }
 }
}

function renderScore(){
 refreshScoreLayout();
 const visible=shownScoreRows(),range=quickRange();
 const playing=phrasePlaying?playbackNote:null;
 const options={
  notes,lyric:scoreLabelFor,shift,octave,currentId:note().id,
  startId:notes[range.start].id,endId:notes[range.end].id,playingId:notes[playing]?.id,
  onPick(id,end){
   const index=noteIndexById.get(id);
   if(end)setQuickEnd(index);else pickRangeNote(index);
  }
 };
 mountScoreRows(visible);
 const mode=$('scoreLineCount').value;
 for(const row of visible){
  const system=rows[row],line=scoreLines.get(row);
  line.box.classList.toggle('preview',mode!=='all'&&row!==viewRow);
  const rebuilt=line.system!==system||line.octave!==octave;
  if(rebuilt){
   const rendered=nativeScore.render(line.staff,system,options);
   line.box.style.setProperty('--system-width',rendered.width+'px');
   line.box.querySelector('.scoreLineLabel').textContent=system.label+' · '+system.measures.map(m=>m.measure.sourceNumber).join('·')+'마디';
   line.box.querySelector('.scoreLineCount').textContent=`${system.noteIds.length}음`;
   line.strip.setAttribute('aria-label',`${row+1}번째 악보 줄의 음표 버튼`);
   buildNoteButtons(line,system,rendered);
   line.system=system;line.octave=octave;line.highlightKey=null;
  }
  if(rebuilt||line.mode!==mode){layoutNoteStrip(line.strip);line.mode=mode;}
  const first=line.buttons[0]?.index,last=line.buttons.at(-1)?.index;
  const here=index=>index!==null&&index>=first&&index<=last?index:'';
  const bounds=range.end>=first&&range.start<=last?`${Math.max(first,range.start)}:${Math.min(last,range.end)}`:'';
  const key=[here(current),here(playing),here(quickAnchor),here(range.start),here(range.end),bounds].join('/');
  if(key===line.highlightKey)continue;
  if(!rebuilt)nativeScore.highlight(line.staff,options);
  updateNoteButtons(line,range,playing);
  line.highlightKey=key;
 }
}

function go(i,withSound=false,fromPhrase=false){
 if(i<0||i>=notes.length)return;
 if(!fromPhrase)stopSingleTone();
 if(!fromPhrase&&phrasePlaying)stopPhrase('구간 재생을 중지하고 음표를 선택했습니다.');
 if(!fromPhrase)quickAnchor=i;
 current=i;
 if(!fromPhrase||!isFullScore())ensureNoteRowVisible(notes[i].row);
 $('lyricInput').value=getLyric(notes[i]);render();if(withSound&&note().kind!=='spoken')playTone(targetMidi());
}
function stepSelectedNote(direction){
 const next=current+direction;
 if(next<0||next>=notes.length)return;
 go(next,true);
 if(isFullScore())scrollToScoreRow(notes[next].row);
}
$('down').onclick=()=>{stopSingleTone();if(phrasePlaying)stopPhrase('키 변경으로 재생을 중지했습니다.');shift=Math.max(-12,shift-1);render()};$('up').onclick=()=>{stopSingleTone();if(phrasePlaying)stopPhrase('키 변경으로 재생을 중지했습니다.');shift=Math.min(12,shift+1);render()};$('oct').onchange=e=>{stopSingleTone();if(phrasePlaying)stopPhrase('옥타브 변경으로 재생을 중지했습니다.');octave=Number(e.target.value);render()};$('prev').onclick=()=>stepSelectedNote(-1);$('next').onclick=()=>stepSelectedNote(1);$('play').onclick=()=>playTone(targetMidi());$('nDown').onclick=()=>{stopSingleTone();if(phrasePlaying)stopPhrase();note().midi--;render()};$('nUp').onclick=()=>{stopSingleTone();if(phrasePlaying)stopPhrase();note().midi++;render()};$('resetCorrections').onclick=()=>{if(confirm('추가/수정한 음표를 모두 초기화할까요?')){if(phrasePlaying)stopPhrase();manualPhrase=null;notes=baseNotes.map(n=>({...n}));current=0;quickAnchor=0;render()}};
// YIN pitch estimator, 75~850 Hz with silence detection
function yin(buf,rate){const rms=Math.sqrt(buf.reduce((s,x)=>s+x*x,0)/buf.length);if(rms<.012)return null;const tauMin=Math.floor(rate/850),tauMax=Math.min(Math.floor(rate/75),Math.floor(buf.length/2)-1),N=buf.length-tauMax;const diff=new Float32Array(tauMax+1);for(let t=1;t<=tauMax;t++){let sum=0;for(let j=0;j<N;j++){const d=buf[j]-buf[j+t];sum+=d*d}diff[t]=sum}let rolling=0,candidate=-1,best=1;for(let t=1;t<=tauMax;t++){rolling+=diff[t];diff[t]=rolling>0?diff[t]*t/rolling:1}for(let t=tauMin;t<=tauMax;t++){if(diff[t]<.16){while(t+1<=tauMax&&diff[t+1]<diff[t])t++;candidate=t;best=diff[t];break}}if(candidate<0){for(let t=tauMin;t<=tauMax;t++)if(diff[t]<best){best=diff[t];candidate=t}if(best>.30)return null}let refined=candidate;if(candidate>1&&candidate<tauMax){let x0=diff[candidate-1],x1=diff[candidate],x2=diff[candidate+1],den=2*(2*x1-x0-x2);if(Math.abs(den)>1e-9)refined+=(x0-x2)/den}const hz=rate/refined;return hz>=75&&hz<=850?{hz,rms,quality:Math.max(0,1-best)}:null}
let yinBuffer=new Float32Array(4096), frames=[];
let micRequestId=0,micInput=null;
async function startMic(){
 const id=++micRequestId;
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('이 브라우저에서는 마이크를 사용할 수 없습니다.');
  const context=ctx=audioSession.get();await audioSession.ensureRunning();
  if(id!==micRequestId||ctx!==context)return;
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  if(id!==micRequestId||ctx!==context||document.visibilityState==='hidden'){stream.getTracks().forEach(track=>track.stop());return}
  media=stream;analyzer=context.createAnalyser();analyzer.fftSize=4096;micInput=context.createMediaStreamSource(media);micInput.connect(analyzer);
  $('micStart').disabled=true;$('micStop').disabled=false;$('micMsg').textContent='마이크 켜짐 · 기준음을 듣고 편하게 따라 불러보세요.';loop();
 }catch(error){if(id===micRequestId)$('micMsg').textContent='마이크를 켤 수 없습니다: '+error.message}
}

let lastSample=0;
function loop(ts=0){if(!analyzer)return;raf=requestAnimationFrame(loop);if(ts-lastSample<100)return;lastSample=ts;analyzer.getFloatTimeDomainData(yinBuffer);const result=yin(yinBuffer,ctx.sampleRate);if(!result){$('heard').textContent='—';$('confidence').textContent='소리가 감지되면 표시됩니다';$('error').textContent='— 센트';$('judge').textContent='목이 편안한 음역에서 연습하세요';successSince=0;frames=[];return}frames.push(result.hz);if(frames.length>4)frames.shift();let fs=frames.slice().sort((a,b)=>a-b),hz=fs[Math.floor(fs.length/2)],raw=69+12*Math.log2(hz/440),heardMidi=Math.round(raw),cents=1200*Math.log2(hz/freq(targetMidi()));$('heard').textContent=midiName(heardMidi);$('confidence').textContent=`${hz.toFixed(1)}Hz · 추정 정확도 ${Math.round(result.quality*100)}%`;$('error').textContent=(cents>0?'+':'')+Math.round(cents)+' 센트';$('needle').style.left=(Math.max(1,Math.min(99,50+cents/2.1)))+'%';const good=Math.abs(cents)<=Number($('tolerance').value);$('judge').textContent=good?'목표 음정에 가깝습니다':'음이 '+(cents<0?'낮습니다':'높습니다');$('judge').className=good?'sub success':'sub caution';if(good){if(!successSince)successSince=Date.now();if($('autoNext').checked&&!phrasePlaying&&Date.now()-successSince>550&&Date.now()-lastAdvance>1400){lastAdvance=Date.now();go(current+1)}}else successSince=0}
function stopMic(){micRequestId++;if(raf)cancelAnimationFrame(raf);raf=null;media?.getTracks().forEach(track=>track.stop());media=null;micInput?.disconnect();micInput=null;analyzer=null;frames=[];successSince=0;$('micStart').disabled=false;$('micStop').disabled=true;$('micMsg').textContent='마이크 꺼짐'}
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
 const first=noteNameFor(notes[p.start]),last=noteNameFor(notes[p.end]);
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
 renderScore();
}
$('quickCount').addEventListener('change',e=>changeQuickCount(e.target.value));
$('quickCount').addEventListener('keydown',e=>{if(e.key==='Enter')e.target.blur()});
$('quickCountDown').onclick=()=>changeQuickCount(getQuickCount()-1);
$('quickCountUp').onclick=()=>changeQuickCount(getQuickCount()+1);
$('lyricInput').addEventListener('input',e=>{
 if(!notes.length)return;
 lyricChanges[String(note().id)]=e.target.value.trim();saveLyrics();
 render();
});
$('lyricResetOne').onclick=()=>{
 delete lyricChanges[String(note().id)];saveLyrics();
 $('lyricInput').value=getLyric(note());
 render();
};
$('lyricResetAll').onclick=()=>{
 if(!confirm('모든 가사 수정을 초기화하고 악보 기준 가사로 되돌릴까요?'))return;
 lyricChanges={};saveLyrics();$('lyricInput').value=getLyric(note());
 render();
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
 stopSingleTone();
 phraseToken++;
 phraseTimers.forEach(t=>clearTimeout(t));phraseTimers=[];
 phraseVoices.forEach(v=>{try{v.gain.gain.cancelScheduledValues(ctx.currentTime);v.gain.gain.setTargetAtTime(.00001,ctx.currentTime,.015);v.oscs.forEach(o=>o.stop(ctx.currentTime+.12))}catch(e){}});
 phraseVoices=[];
 phrasePlaying=false;activePlayback=null;playbackNote=null;
 if(message)phraseInfoMessage=message;
 updatePhraseUI();renderScore();
}
function schedulePhraseTone(midi,at,dur){
 phraseVoices.push(scheduleSynthTone(midi,at,dur));
}
async function playPhrase(range=null,kind='regular'){
 stopPhrase();
 const p=range||getPhrase(),from=p.start,to=p.end;
 const token=phraseToken;
 phrasePlaying=true;activePlayback={from,to,kind};playbackNote=null;
 phraseInfoMessage='음원 준비 중…';updatePhraseUI();
 try{
  ctx=audioSession.get();
  await audioSession.ensureRunning();
  await preparePiano(notes.slice(from,to+1).filter(n=>n.kind!=='spoken').map(n=>practiceMidi(n)));
 }catch(e){if(token===phraseToken)stopPhrase('음원 로딩 실패 · 다시 재생해 주세요.');return;}
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
   schedulePhraseTone(practiceMidi(n),startAt+onset,unit*held*.96);
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
applyScoreView();
$('soundStyle').addEventListener('change',()=>{
 if(phrasePlaying)stopPhrase('소리 종류를 변경했습니다. 새 소리로 구간을 다시 들어보세요.');
 playTone(targetMidi());
});

function pauseSongAudio(){
 stopPhrase();stopMic();playbackOutput=null;ctx=null;
 $('soundState').textContent='소리를 누르면 다시 연결됩니다.';
}
