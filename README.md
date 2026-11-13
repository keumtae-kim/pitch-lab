# 보컬 연습실

GitHub Pages: https://keumtae-kim.github.io/pitch-lab/

## Structure

- `aloha.html`, `bom.html`: stable entry URLs generated from one template.
- `assets/trainer.js`, `assets/trainer.css`: common selection, playback, microphone and responsive UI.
- `assets/score-renderer.js`: shared SVG notation, transposition and measure layout, using locally bundled VexFlow 4.2.5 (MIT).
- `songs/<id>.json`: canonical, reviewed musical data. `songs/<id>.js` is generated browser input.
- `pitch.html`: independent scale/ear-training tool.

## Add or correct a song

1. Obtain the source melody PDF. Prefer MusicXML when supplied by the publisher. A PDF is a visual document, not a reliable machine-readable music format.
2. Optional vector inspection: `python tools/inspect-score-pdf.py source.pdf --key D --output draft.json` (PyMuPDF required). This produces a review draft only. It deliberately does not claim to infer rhythm, backing-voice choices, syllable-to-note mapping, or repeat order automatically.
3. Create `songs/<id>.json` following the existing models. Review every pitch/accidental, duration, rest, tie and lyric against the original. Expand repeat endings into performance order. Keep backing voices separate from the lead melody.
4. Run `node tools/build-songs.cjs`. This validates musical time and links, generates the JS wrapper and entry HTML, and updates the catalog. Run `node tests/score-data.cjs`.
5. Serve the folder over HTTP and verify 2/4 systems, narrow/wide layout, transposition, click/right-click range selection and playback. Publish via the existing Pages deployment.

## Data schema, version 1

`key`, `bpm`, `writtenOctaveOffset` and `vocalStart` set song defaults. Pitch uses MIDI numbering (C4 = 60); `pitch.step/octave/alter` preserve the original spelling. The default male vocal playback is one octave below the printed treble score.

`measures` are in performance order. Each has a source measure number, meter, length in quarter-note beats, optional pickup, section label, chords, and ordered events. A note event references exactly one stable `noteId`; rests are explicit. `notation.value` is a denominator (4 = quarter, 8 = eighth), `dots` counts augmentation dots, and `tuplet:3` means three eighth notes in the time of two. `beat` is the onset inside that measure.

`notes` contain stable IDs, MIDI pitch, duration/onset, preceding rest and tie-from-previous status. Both playback and notation are validated against the same musical time. Lyrics are syllables or sung English words, not PDF glyph fragments. `sections` support quick navigation. Generated screen systems are responsive and never stored as source musical structure.

Changing page width or semitone transposition reflows whole measures. Desktop content is capped at 1100px, and sparse systems keep natural spacing instead of expanding across the entire card. A dense single measure scales to fit a narrow phone without horizontal scrolling. Clef, key and time-signature prefixes use narrower glyphs and reduced padding. Readable note buttons form at most two consecutive staggered runs when crowded; later runs begin near their score positions rather than restarting at the left edge. The 2/4-system setting is independent of button runs. Button and tuner note names always use fixed sharp spelling, while staff notation follows the transposed key. Playback pitch is unchanged. No reference scan is required by the renderer.

Source caveats: an omitted backing part is intentional, repeated source measure numbers are intentional, and printed performance ad-libs are retained. Proofreading remains necessary when importing any new PDF.
