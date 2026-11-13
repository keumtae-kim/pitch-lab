/* Native notation adapter. VexFlow engraves symbols; song data owns musical time. */
(function(root){
'use strict';
const LETTERS='CDEFGAB',NATURAL=[0,2,4,5,7,9,11],KEYS=['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
const PC={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
const KEY_ALTERS={C:{},D:{F:1,C:1},E:{F:1,C:1,G:1,D:1},G:{F:1},A:{F:1,C:1,G:1},B:{F:1,C:1,G:1,D:1,A:1},F:{B:-1},Bb:{B:-1,E:-1},Eb:{B:-1,E:-1,A:-1},Ab:{B:-1,E:-1,A:-1,D:-1},Db:{B:-1,E:-1,A:-1,D:-1,G:-1},'F#':{F:1,C:1,G:1,D:1,A:1,E:1}};
const mod=(a,b)=>(a%b+b)%b;
function tonic(key){return mod(PC[key[0]]+(key[1]==='#'?1:key[1]==='b'?-1:0),12);}
function transposedKey(key,shift){return KEYS[mod(tonic(key)+shift,12)];}
function spellPitch(pitch,midi,key,shift){
 const newKey=transposedKey(key,shift),delta=LETTERS.indexOf(newKey[0])-LETTERS.indexOf(key[0]);
 const step=LETTERS[mod(LETTERS.indexOf(pitch.step)+delta,7)],natural=PC[step],target=midi+shift;
 const octave=Math.round((target-natural)/12)-1,alter=target-(12*(octave+1)+natural);
 const originalMidi=12*(pitch.octave+1)+PC[pitch.step]+pitch.alter;
 if((!shift&&midi===originalMidi)||Math.abs(alter)<=1)return {step,octave,alter};
 // Prefer a readable enharmonic spelling to a double accidental after transposition.
 const candidates=[...LETTERS].map(letter=>{const oct=Math.round((target-PC[letter])/12)-1,alt=target-(12*(oct+1)+PC[letter]);return {step:letter,octave:oct,alter:alt,weight:(alt===(KEY_ALTERS[newKey]?.[letter]||0)?0:2)+(letter===step?0:.3)+Math.abs(alt)*.1};}).filter(p=>Math.abs(p.alter)<=1);
 candidates.sort((a,b)=>a.weight-b.weight);return candidates[0];
}
function transposeChord(label,key,shift){if(!shift)return label;const names=transposedKey(key,shift).includes('b')?['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']:['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];return label.replace(/(^|\/)([A-G])([#b]?)/g,(_,prefix,letter,acc)=>prefix+names[mod(PC[letter]+(acc==='#'?1:acc==='b'?-1:0)+shift,12)]);}
function textWidth(text,size=12){if(typeof document==='undefined')return [...text].reduce((w,c)=>w+(c.charCodeAt(0)>255?size:size*.62),0);const c=textWidth.context||(textWidth.context=document.createElement('canvas').getContext('2d'));c.font=`600 ${size}px system-ui, sans-serif`;return c.measureText(text).width;}
function validateSong(song){
 if(song.schemaVersion!==1||!Array.isArray(song.measures)||!Array.isArray(song.notes))throw Error('지원하지 않는 악보 데이터입니다.');
 const ids=new Set();for(const n of song.notes){if(ids.has(n.id))throw Error('중복 음표 ID');if(!Number.isFinite(n.midi)||n.midi<0||n.midi>127)throw Error('유효하지 않은 MIDI 음높이');ids.add(n.id);}
 const noteMap=new Map(song.notes.map(n=>[n.id,n]));let time=0;const used=[];for(const m of song.measures){let beat=0;for(const e of m.events){if(Math.abs(e.beat-beat)>.00001||!(e.beats>0))throw Error(`${m.id}: 음표 시간 오류`);if(e.kind==='note'){if(!ids.has(e.noteId))throw Error('음표 ID 누락');const n=noteMap.get(e.noteId);if(Math.abs(n.at-(time+beat))>.00001||Math.abs(n.beats-e.beats)>.00001)throw Error('악보와 재생 데이터 불일치');used.push(e.noteId);}const notation=e.notation;const writtenBeats=4/Number(notation?.value)*(2-Math.pow(2,-notation?.dots))*(notation?.tuplet===3?2/3:1);if(!Number.isFinite(writtenBeats)||Math.abs(writtenBeats-e.beats)>.00001)throw Error('기보와 재생 길이 불일치');beat+=e.beats;}if(Math.abs(beat-m.length)>.00001)throw Error(`${m.id}: 마디 길이 오류`);if(!m.pickup&&Math.abs(beat-m.meter[0]*4/m.meter[1])>.00001)throw Error(`${m.id}: 박자 합계 오류`);time+=m.length;}
 if(used.length!==song.notes.length||new Set(used).size!==used.length)throw Error('마디와 음표 연결 오류');
 return true;
}
class ScoreRenderer{
 constructor(song){validateSong(song);this.song=song;this.plan=null;this.cache=new WeakMap();}
 layout(width,notes,lyric,shift=0){
  const lookup=new Map(notes.map(n=>[n.id,n]));const key=transposedKey(this.song.key,shift);const VF=root.Vex?.Flow;const prefix=VF?Math.ceil(new VF.Stave(0,0,1000).addClef('treble','default','8vb').addKeySignature(key).addTimeSignature('4/4').getNoteStartX()):146;
  const breakMeasures=new Set(this.song.sections.map(s=>lookup.get(s.noteId)?.measureId));breakMeasures.add(lookup.get(this.song.vocalStart)?.measureId);
  const specs=this.song.measures.map((measure,index)=>{const cells=measure.events.map(e=>{const n=lookup.get(e.noteId);const label=e.kind==='note'?lyric(n):'';return Math.max(e.kind==='note'?34:20,textWidth(label,12)+12);});return {measure,cells,minWidth:cells.reduce((a,b)=>a+b,0)+32+(index&&this.song.measures[index-1].meter.join('/')!==measure.meter.join('/')?32:0)};});
  const systems=[];let group=[],used=prefix;
  const finish=()=>{if(!group.length)return;const minWidth=prefix+group.reduce((s,m)=>s+m.minWidth,0)+8;const systemWidth=Math.max(width,minWidth);const spare=systemWidth-minWidth;const totalWeight=group.reduce((s,m)=>s+Math.sqrt(m.measure.length),0);
   const laid=group.map((s,i)=>({...s,width:s.minWidth+spare*Math.sqrt(s.measure.length)/totalWeight}));
   const noteIds=laid.flatMap(m=>m.measure.events.filter(e=>e.kind==='note').map(e=>e.noteId));
   systems.push({index:systems.length,width:systemWidth,prefix,measures:laid,noteIds,label:laid[0].measure.label,firstMeasure:laid[0].measure.sourceNumber,lastMeasure:laid.at(-1).measure.sourceNumber});group=[];used=prefix;};
  for(const spec of specs){if(group.length&&(breakMeasures.has(spec.measure.id)||used+spec.minWidth+8>width||group.length>=4))finish();group.push(spec);used+=spec.minWidth;}finish();
  const noteRows=new Map();for(const s of systems)for(const id of s.noteIds)noteRows.set(id,s.index);this.plan={systems,noteRows,key,shift,width};return this.plan;
 }
 render(host,system,options){
  const {notes,lyric,shift=0,octave=-12,onPick}=options;const lookup=new Map(notes.map(n=>[n.id,n]));
  const signature=system.noteIds.map(id=>`${id}:${lookup.get(id).midi}:${lyric(lookup.get(id))}`).join('|')+`/${system.index}/${system.width}/${shift}/${octave}`;
  const old=this.cache.get(host);if(old?.signature===signature){this.highlight(host,options);return old;}
  const VF=root.Vex?.Flow;if(!VF)throw Error('악보 렌더러를 불러오지 못했습니다. 새로고침해 주세요.');
  host.replaceChildren();const renderer=new VF.Renderer(host,VF.Renderer.Backends.SVG);renderer.resize(system.width,230);const ctx=renderer.getContext();ctx.setFont('Arial',12);const svg=host.querySelector('svg');svg.classList.add('native-score');svg.setAttribute('role','group');svg.setAttribute('aria-label',`${system.label}, ${system.firstMeasure}~${system.lastMeasure}마디`);
  const key=transposedKey(this.song.key,shift);let cursor=4;const built=[],anchors=new Map(),measureInfo=[];let lastMeter='';
  for(let mi=0;mi<system.measures.length;mi++){
   const spec=system.measures[mi],m=spec.measure,first=mi===0,staveWidth=spec.width+(first?system.prefix:0);const stave=new VF.Stave(cursor,35,staveWidth);
   if(first){stave.addClef('treble','default',octave===-12?'8vb':octave===12?'8va':undefined);stave.addKeySignature(key);}
   const meter=m.meter.join('/');if(first||meter!==lastMeter)stave.addTimeSignature(meter);lastMeter=meter;stave.setContext(ctx).draw();
   const accidentals={};const entry=[];
   for(const e of m.events){const model=lookup.get(e.noteId);const p=e.kind==='note'?spellPitch(e.pitch,model.midi,this.song.key,shift):{step:'B',octave:4,alter:0};const keyString=`${p.step.toLowerCase()}/${p.octave}${e.spoken?'/x':''}`;
    const note=new VF.StaveNote({clef:'treble',keys:[keyString],duration:e.notation.value+'d'.repeat(e.notation.dots)+(e.kind==='rest'?'r':''),auto_stem:true});
    if(e.kind==='note'){const accidentalKey=p.step+p.octave;const previous=accidentals[accidentalKey]??(KEY_ALTERS[key]?.[p.step]||0);if(p.alter!==previous&&!e.tied){note.addModifier(new VF.Accidental(p.alter===0?'n':p.alter===1?'#':p.alter===-1?'b':p.alter===2?'##':'bb'),0);}accidentals[accidentalKey]=p.alter;}
    note.setStave(stave).setContext(ctx);
    for(let d=0;d<e.notation.dots;d++)VF.Dot.buildAndAttach([note],{all:true});
    entry.push({event:e,note,model,pitch:p,stave,system:system.index});
   }
   const tuplets=[];for(let i=0;i<entry.length;i++){if(entry[i].event.notation.tuplet===3){const group=entry.slice(i,i+3);if(group.length===3&&group.every(e=>e.event.notation.tuplet===3)){tuplets.push(new VF.Tuplet(group.map(e=>e.note),{num_notes:3,notes_occupied:2}));i+=2;}}}
   const voice=new VF.Voice({num_beats:m.meter[0],beat_value:m.meter[1]}).setStrict(false).addTickables(entry.map(e=>e.note));
   const beams=VF.Beam.generateBeams(entry.map(e=>e.note),{groups:[new VF.Fraction(1,4)],beam_rests:false,maintain_stem_directions:false});
   new VF.Formatter().joinVoices([voice]).formatToStave([voice],stave);
   const start=stave.getNoteStartX()+14,end=cursor+staveWidth-10;const usable=end-start;const minTotal=spec.cells.reduce((a,b)=>a+b,0);const extra=Math.max(0,usable-minTotal);const weights=entry.map(e=>Math.sqrt(e.event.beats));const weightSum=weights.reduce((a,b)=>a+b,0);let x=start;
   entry.forEach((item,i)=>{const cell=spec.cells[i]+extra*weights[i]/weightSum;const wanted=x+cell/2;const tc=item.note.getTickContext();const actual=item.note.getAbsoluteX()+item.note.getGlyphWidth()/2;tc.setX(tc.getX()+wanted-actual);item.x=wanted;x+=cell;});
   for(const item of entry){const group=ctx.openGroup('native-note',`score-${host.id}-${item.event.kind==='note'?item.event.noteId:'rest-'+m.id+'-'+item.event.beat}`);item.note.draw();ctx.closeGroup();group.classList.add('native-note');item.group=group;if(item.event.kind==='note'){group.dataset.noteId=String(item.event.noteId);const y=item.note.getYs()[0];anchors.set(item.event.noteId,{x:item.x,y});}built.push(item);}
   for(const beam of beams)beam.setContext(ctx).draw();for(const tuplet of tuplets)tuplet.setContext(ctx).draw();
   measureInfo.push({m,entry,start:cursor,end:cursor+staveWidth});cursor+=staveWidth;
  }
  const byId=new Map(built.filter(x=>x.event.kind==='note').map(x=>[x.event.noteId,x]));
  for(const item of built){if(item.event.kind!=='note')continue;const ix=notes.findIndex(n=>n.id===item.event.noteId),prev=notes[ix-1],next=notes[ix+1];if(item.model.tied){const first=prev?byId.get(prev.id)?.note:undefined;new VF.StaveTie({first_note:first,last_note:item.note,first_indices:[0],last_indices:[0]}).setContext(ctx).draw();}if(next?.tied&&!byId.has(next.id))new VF.StaveTie({first_note:item.note,last_note:undefined,first_indices:[0],last_indices:[0]}).setContext(ctx).draw();}
  const namespace='http://www.w3.org/2000/svg';const addText=(text,x,y,className)=>{const t=document.createElementNS(namespace,'text');t.textContent=text;t.setAttribute('x',x);t.setAttribute('y',y);t.setAttribute('class',className);t.setAttribute('stroke','none');svg.append(t);return t;};
  const glyphBounds=svg.getBBox();const chordY=Math.min(52,glyphBounds.y-6);const lyricY=Math.max(135,glyphBounds.y+glyphBounds.height+18);
  for(const info of measureInfo){addText(String(info.m.sourceNumber||'못갖춘마디'),info.start+4,chordY-17,'measure-number');for(const chord of info.m.chords){const near=info.entry.reduce((best,item)=>Math.abs(item.event.beat-chord.beat)<Math.abs(best.event.beat-chord.beat)?item:best,info.entry[0]);const t=addText(transposeChord(chord.label,this.song.key,shift),near.x,chordY,'chord-label');t.setAttribute('text-anchor','middle');}}
  for(const item of built){if(item.event.kind!=='note')continue;const id=item.event.noteId,label=lyric(item.model);if(label)addText(label,item.x,lyricY,'score-lyric').setAttribute('text-anchor','middle');
   const center=anchors.get(id);const mark=document.createElementNS(namespace,'rect');mark.setAttribute('x',center.x-13);mark.setAttribute('y',center.y-11);mark.setAttribute('width',26);mark.setAttribute('height',22);mark.setAttribute('rx',6);mark.setAttribute('class','note-highlight');item.group.prepend(mark);
   const hit=document.createElementNS(namespace,'rect');hit.setAttribute('x',center.x-17);hit.setAttribute('y',Math.min(center.y-22,65));hit.setAttribute('width',34);hit.setAttribute('height',Math.max(44,lyricY-Math.min(center.y-22,65)+6));hit.setAttribute('fill','transparent');hit.setAttribute('stroke','none');hit.setAttribute('class','note-hit');hit.setAttribute('tabindex','0');hit.setAttribute('role','button');hit.setAttribute('aria-label',`${notes.indexOf(item.model)+1}번 ${label||'음표'} 선택`);hit.dataset.noteId=String(id);hit.addEventListener('click',()=>onPick(id,false));hit.addEventListener('contextmenu',e=>{e.preventDefault();onPick(id,true);});hit.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onPick(id,e.shiftKey);}});svg.append(hit);
  }
  const bounds=svg.getBBox(),top=Math.floor(Math.min(bounds.y,0))-3,bottom=Math.ceil(Math.max(bounds.y+bounds.height,lyricY+8));svg.setAttribute('viewBox',`0 ${top} ${system.width} ${bottom-top}`);svg.setAttribute('height',bottom-top);svg.setAttribute('width',system.width);svg.style.height=(bottom-top)+'px';svg.style.width=system.width+'px';host.style.width=system.width+'px';host.style.height=(bottom-top)+'px';
  const result={signature,anchors,system,width:system.width,height:bottom-top};this.cache.set(host,result);this.highlight(host,options);return result;
 }
 highlight(host,{currentId,startId,endId,playingId,notes}){const index=new Map(notes.map((n,i)=>[n.id,i]));for(const group of host.querySelectorAll('.native-note[data-note-id]')){const id=Number(group.dataset.noteId);group.classList.toggle('is-selected',id===currentId);group.classList.toggle('is-playing',id===playingId);group.classList.toggle('is-start',id===startId);group.classList.toggle('is-end',id===endId);group.classList.toggle('is-range',index.get(id)>=index.get(startId)&&index.get(id)<=index.get(endId));}}
}
const api={ScoreRenderer,validateSong,spellPitch,transposedKey,transposeChord};if(typeof module!=='undefined')module.exports=api;Object.assign(root,api);
})(typeof window!=='undefined'?window:globalThis);
