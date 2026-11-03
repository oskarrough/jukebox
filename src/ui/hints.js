// A few words on what a setting, option or line does, shown when you point
// at it in the score. In the guide's words, where it has them.
import { chordToMidis, parseKey } from '../score.js'
import { prefersFlats, transposeNoteName } from '../key.js'

export const DRUM_STEPS = 'x a hit, X an accent, o a soft hit, . a rest'

// What an option starts at when picked, to drag from: as many decimals as a drag should move by.
export const START = {
	vol: '0.8',
	pan: '0.0',
	rev: '0.2',
	oct: '0',
	trans: '0',
	gate: '0.5',
	glide: '0.07',
	bright: '1.0',
	att: '0.01',
	rel: '0.2',
	center: 'D3',
	drive: '1.0',
	echo: '3',
	tail: '0.5',
	pump: '0.5',
	tempo: '120',
	beats: '4',
	steps: '4',
	swing: '0.1',
}

export const HINTS = {
	// voice options
	vol: 'How loud',
	pan: 'Left to right',
	rev: 'How much room',
	oct: 'Octaves up or down',
	trans: 'Notes up or down',
	gate: 'Short to long notes',
	glide: 'How slowly a ~ slides',
	bright: 'Dark to bright',
	att: 'How slowly it fades in',
	rel: 'How long it rings out',
	center: 'The note chords sit around',
	drive: 'How dirty',
	echo: 'Steps between echoes',
	tail: 'How long echoes last',
	pump: 'Dips with the kick',
	part: 'Which notes an x plays',
	// settings, in the head or on a pattern
	tempo: 'Beats a minute',
	beats: 'Beats to a bar',
	steps: 'Steps to a beat',
	swing: 'Lazy off-beats',
	reverb: 'How much room',
	key: "The song's key",
	tags: 'Any words, to find the song by in the list',
	// lines
	chords: 'The chords, bar by bar, that voices written in x steps play',
	from: 'Starts as a copy of that pattern',
	mute: 'Drops voices',
	play: 'Plays once, before the loop',
	loop: 'Repeats forever: *2 plays a pattern twice, +5 or -2 transposes it',
}

// The notes of chord `sym` around D4, as in Dm9: D3 F3 A3 C4 E4. Null if
// it's no chord.
export function chordNotes(sym) {
	const notes = chordToMidis(sym.replace(/^\[|\][-!?]*$/g, ''), 62)
	// spelt as the chord's own key would: Gm9 has a Bb, E has a G#
	const root = /^\[?([A-G][#b]?)(m(?!aj))?/.exec(sym)
	const flats = root ? prefersFlats(parseKey(root[1] + (root[2] ?? ''))) : false
	return notes && notes.map((m) => transposeNoteName('C0', m - 12, flats)).join(' ')
}
