#!/usr/bin/env python3
"""Inspect a text/vector melody PDF. The output is a review draft, not a score.
Requires PyMuPDF. No network service or OCR is used; scanned PDFs fail clearly.
"""
import argparse,json,math
from pathlib import Path
import fitz
p=argparse.ArgumentParser(description=__doc__);p.add_argument('pdf');p.add_argument('--key',choices=['C','D','E','F','G','A','B','Bb','Eb','Ab','Db','F#'],required=True);p.add_argument('--output',required=True);args=p.parse_args()
alters={'C':{},'D':{'F':1,'C':1},'E':{'F':1,'C':1,'G':1,'D':1},'F':{'B':-1},'G':{'F':1},'A':{'F':1,'C':1,'G':1},'B':{'F':1,'C':1,'G':1,'D':1,'A':1},'Bb':{'B':-1,'E':-1},'Eb':{'B':-1,'E':-1,'A':-1},'Ab':{'B':-1,'E':-1,'A':-1,'D':-1},'Db':{'B':-1,'E':-1,'A':-1,'D':-1,'G':-1},'F#':{'F':1,'C':1,'G':1,'D':1,'A':1,'E':1}}[args.key]
out={'kind':'pdf-inspection-draft','reviewRequired':True,'source':Path(args.pdf).name,'key':args.key,'systems':[]}
for page_number,page in enumerate(fitz.open(args.pdf),1):
 chars=[{**c,'font':s['font'],'size':s['size']} for b in page.get_text('rawdict')['blocks'] for line in b.get('lines',[]) for s in line['spans'] for c in s['chars']]
 lines=sorted(set(round(d['rect'].y0,2) for d in page.get_drawings() if d['rect'].width>page.rect.width*.7 and d['rect'].height<.1))
 groups=[]
 for y in lines:
  if not groups or y-groups[-1][-1]>8:groups.append([y])
  else:groups[-1].append(y)
 for group in groups:
  if len(group)!=5:continue
  top,bottom=group[0],group[-1];notes=[]
  for c in chars:
   x,y=c['origin']
   if c['font']!='Maestro' or c['c'] not in 'œ˙w' or not top-23<y<bottom+23:continue
   d=30+round((bottom-y)/((bottom-top)/8));step='CDEFGAB'[d%7];octave=d//7;alter=alters.get(step,0)
   accidentals=[a for a in chars if a['font']=='Maestro' and a['c'] in '#bn' and 0<x-a['origin'][0]<9 and abs(a['origin'][1]-y)<.2]
   notes.append({'x':x,'y':y,'pitchFromKeyOnly':{'step':step,'octave':octave,'alter':alter},'glyph':c['c'],'explicitAccidentals':[a['c'] for a in accidentals]})
  text=[{'text':c['c'],'x':c['origin'][0],'y':c['origin'][1]} for c in chars if 'CID' in c['font'] and bottom+8<c['origin'][1]<bottom+55]
  out['systems'].append({'page':page_number,'top':top,'bottom':bottom,'heads':sorted(notes,key=lambda n:n['x']),'lyricsGlyphs':text})
if not any(s['heads'] for s in out['systems']):raise SystemExit('No supported vector note glyphs found. Use MusicXML or a manually reviewed transcription for this PDF.')
Path(args.output).write_text(json.dumps(out,ensure_ascii=False,indent=2));print(f"{len(out['systems'])} systems inspected. Review voices, duration, accidentals, lyrics and repeats before publishing.")
