const assert=require('assert'),fs=require('fs'),path=require('path');const {ScoreRenderer,validateSong,transposedKey,spellPitch}=require('../assets/score-renderer.js');
const songIds=fs.readdirSync(path.join(__dirname,'../songs')).filter(name=>name.endsWith('.json')).map(name=>name.slice(0,-5));
for(const id of songIds){const song=JSON.parse(fs.readFileSync(path.join(__dirname,'../songs',id+'.json'),'utf8'));assert(validateSong(song));const renderer=new ScoreRenderer(song);for(const width of [340,600,800,1268,1740])for(const shift of [-4,0,3]){const p=renderer.layout(width,song.notes,n=>n.lyric,shift);assert.equal(p.noteRows.size,song.notes.length);assert(p.systems.every(s=>s.displayWidth<=width+1e-7&&s.displayWidth>0&&s.measures.length));for(const n of song.notes){const p=spellPitch(n.pitch,n.midi,song.key,shift);const natural={C:0,D:2,E:4,F:5,G:7,A:9,B:11}[p.step];assert.equal(12*(p.octave+1)+natural+p.alter,n.midi+shift);}}const corrupt=structuredClone(song);corrupt.measures[0].events[0].beats+=.25;assert.throws(()=>validateSong(corrupt));console.log(`${id}: musical time, ID coverage, responsive systems and transposition passed`);}
assert.equal(transposedKey('D',-3),'B');assert.equal(transposedKey('E',-3),'Db');

for(const id of songIds){const song=JSON.parse(fs.readFileSync(path.join(__dirname,'../songs',id+'.json'),'utf8'));song.measures[0].events[0].notation.value='1';assert.throws(()=>validateSong(song));}

const {fitNoteLanes,sharpNoteName}=require('../assets/score-renderer.js');
assert.equal(sharpNoteName(56),'G♯3');assert.equal(sharpNoteName(61),'C♯4');
const {fixedDoName,scaleDegreeName}=require('../assets/score-renderer.js');
assert.deepEqual(Array.from({length:12},(_,i)=>fixedDoName(60+i)),
 ['도','도♯','레','레♯','미','파','파♯','솔','솔♯','라','라♯','시']);
assert.equal(fixedDoName(59),'시'); // B3, including the original opening pitch of 봄봄봄
assert.equal(fixedDoName(59-3),'솔♯');
assert.equal(fixedDoName(57),'라'); // A3, the original opening vocal pitch of 아로하
assert.equal(scaleDegreeName({step:'D',octave:4,alter:0},62,'D'),'도');
assert.equal(scaleDegreeName({step:'F',octave:4,alter:1},66,'D'),'미');
assert.equal(scaleDegreeName({step:'A',octave:4,alter:0},69,'D'),'솔');
assert.equal(scaleDegreeName({step:'G',octave:4,alter:1},68,'D'),'파♯');
assert.equal(scaleDegreeName({step:'A',octave:4,alter:-1},68,'D'),'솔♭');
assert.equal(scaleDegreeName({step:'B',octave:4,alter:-1},70,'Ab'),'레');
assert.equal(scaleDegreeName({step:'F',octave:4,alter:1},65,'D'),'미♭'); // manually corrected F♯ to F
for(const id of songIds){const song=JSON.parse(fs.readFileSync(path.join(__dirname,'../songs',id+'.json'),'utf8'));for(const width of [280,340,390,600,768,1046]){const renderer=new ScoreRenderer(song);for(const system of renderer.layout(width,song.notes,n=>n.lyric,-3).systems){const count=system.noteIds.length,anchors=Array.from({length:count},(_,i)=>(system.prefix+(i+.5)*(system.width-system.prefix)/Math.max(1,count))/system.width),layout=fitNoteLanes(anchors,anchors.map(()=>38),system.displayWidth,width<=600);assert.equal(layout.placements.length,count);assert(layout.runs.length<=2);for(let i=0;i<count;i++){const p=layout.placements[i];assert(p.left>=-.001&&p.left+p.width<=system.displayWidth+.001);if(i){const prev=layout.placements[i-1];assert(p.row>=prev.row);if(p.row===prev.row)assert(p.left>=prev.left+prev.width+2.99);}}}}}
const stepped=fitNoteLanes(Array.from({length:10},(_,i)=>.29+i*.066),Array(10).fill(38),340,true);assert(stepped.runs.length>1);assert(stepped.placements[stepped.runs[1].from].left>340*.25);console.log('Sharp labels, viewport fitting and consecutive staggered button lanes passed');

// Measure the actual engraving prefix, including the five-flat -3-key case.
globalThis.Vex=require('../assets/vendor/vexflow-4.2.5.js');
for(const id of songIds){const song=JSON.parse(fs.readFileSync(path.join(__dirname,'../songs',id+'.json'),'utf8'));for(const shift of [-3,0,3]){const key=transposedKey(song.key,shift),oldPrefix=new Vex.Flow.Stave(0,0,1000).addClef('treble','default','8vb').addKeySignature(key).addTimeSignature('4/4').getNoteStartX();const plan=new ScoreRenderer(song).layout(340,song.notes,n=>n.lyric,shift);assert(plan.systems.every(s=>s.prefix<oldPrefix*.85));}}
console.log('Two button rows and compact clef/key/time prefix passed');

const every=JSON.parse(fs.readFileSync(path.join(__dirname,'../songs/every-moment.json'),'utf8'));
assert.equal(every.notes.length,404);assert.equal(every.measures.length,58);assert.equal(every.measures.reduce((n,m)=>n+m.length,0),232);assert.equal(every.notes[every.vocalStart].midi-every.writtenOctaveOffset,58);
assert.deepEqual(every.measures.map(m=>m.sourceNumber),[...Array.from({length:36},(_,i)=>i+1),...Array.from({length:7},(_,i)=>i+17),...Array.from({length:15},(_,i)=>i+37)]);
const secondEnding=every.measures.find(m=>m.sourceNumber===37);const held=every.notes.find(n=>n.measureId===secondEnding.id);assert(held.tied);assert.equal(held.midi,every.notes[held.id-1].midi);
assert.equal(every.measures.flatMap(m=>m.events).filter(e=>e.notation.tuplet===3).length,18);
assert.deepEqual(every.practiceTempos,[50,67,80]);console.log('Every Moment: reviewed pitch, complete expanded repeat order, second-ending tie and triplets passed');

for(const note of every.notes){assert.equal(12*(note.pitch.octave+1)+{C:0,D:2,E:4,F:5,G:7,A:9,B:11}[note.pitch.step]+note.pitch.alter,note.midi);}
assert.deepEqual(every.measures[2].chords.map(c=>c.beat),[0,2]);

const firefly=JSON.parse(fs.readFileSync(path.join(__dirname,'../songs/firefly.json'),'utf8'));
assert.equal(firefly.notes[firefly.vocalStart].midi-firefly.writtenOctaveOffset,52);
assert.equal(firefly.notes[135].midi,firefly.notes[firefly.vocalStart].midi+12);
assert.deepEqual(firefly.measures.map(m=>m.sourceNumber),Array.from({length:66},(_,i)=>i+1));
assert.deepEqual(firefly.measures.slice(-3).map(m=>m.meter),[[4,4],[2,4],[4,4]]);
assert.deepEqual(firefly.measures[64].events.map(e=>[e.beats,e.tied]),[[2,true]]);
for(const [i,note] of firefly.notes.entries()){
 if(!note.tied)continue;
 assert.equal(note.midi,firefly.notes[i-1].midi);
 assert.equal(note.leadRest,0);
 assert.equal(note.lyric,'');
}
assert.equal(firefly.measures.flatMap(m=>m.events).filter(e=>e.notation.tuplet===3).length,30);
console.log('Firefly: E3 vocal entry, octave rise, ties, triplets and 2/4 ending passed');
