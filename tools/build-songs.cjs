#!/usr/bin/env node
/* Validate canonical JSON, generate browser data, catalog and stable song URLs. */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {validateSong,sharpNoteName}=require('../assets/score-renderer.js');
const root=path.resolve(__dirname,'..'),template=fs.readFileSync(path.join(__dirname,'song-page.template.html'),'utf8');
const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const version=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex').slice(0,12);
const songs=fs.readdirSync(path.join(root,'songs')).filter(n=>n.endsWith('.json')).sort().map(name=>JSON.parse(fs.readFileSync(path.join(root,'songs',name),'utf8')));
for(const song of songs){
 validateSong(song);if(!/^[a-z0-9-]+$/.test(song.id))throw Error('Song ID must use lowercase ASCII letters, digits and hyphens.');
 fs.writeFileSync(path.join(root,'songs',song.id+'.js'),'window.SCORE_SONG='+JSON.stringify(song)+';\n');
 console.log(`${song.id}: ${song.notes.length} notes, ${song.measures.length} measures validated`);
}
const catalog=songs.map(({id,title,artist})=>({id,title,artist,url:id+'.html'}));
fs.writeFileSync(path.join(root,'songs','catalog.js'),'window.SCORE_CATALOG='+JSON.stringify(catalog)+';\n');
for(const song of songs){
 const page=template.replaceAll('__SONG_TITLE__',escape(song.title)).replaceAll('__SONG_ID__',song.id).replaceAll('__NOTE_COUNT__',String(song.notes.length)).replaceAll('__START_NOTE__',sharpNoteName(song.notes[song.vocalStart].midi-song.writtenOctaveOffset));
 fs.writeFileSync(path.join(root,song.id+'.html'),page.replace(/(src|href)="((?:assets|songs)\/[^"?]+)(?:\?v=[a-f0-9]+)?"/g,(_,attribute,file)=>attribute+'="'+file+'?v='+version(file)+'"'));
}
const indexPath=path.join(root,'index.html');
fs.writeFileSync(indexPath,fs.readFileSync(indexPath,'utf8').replace(/src="songs\/catalog\.js(?:\?v=[a-f0-9]+)?"/,'src="songs/catalog.js?v='+version('songs/catalog.js')+'"'));
