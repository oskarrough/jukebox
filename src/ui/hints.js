// A few words on what a setting, option or line does, shown when you point
// at it in the score. In the guide's words, where it has them.
import { chordToMidis, parseKey } from '../score.js'
import { prefersFlats, transposeNoteName } from '../key.js'

export const DRUM_STEPS = 'x a hit, X an accent, o a soft hit, . a rest'

export const HINTS = {
	// voice options
	vol: 'Volume, 0 to 2 (0.8)',
	pan: '-1 left to 1 right',
	rev: 'Reverb send, 0 to 1',
	oct: 'Shifts octaves',
	trans: 'Shifts semitones',
	gate: 'How much of each note sounds, 0.05 to 1 (0.5 is staccato)',
	glide: 'Seconds a ~ slide takes (0.07)',
	bright: '0.1 dark to 4 bright (1)',
	att: 'Attack in seconds',
	rel: 'Release in seconds',
	center: 'Where chords are voiced',
	drive: '0 to 4, dirt for 808, logdrum and drive',
	echo: 'Steps between echoes, 0 to 16 (off)',
	tail: 'How much of each echo comes back, 0 to 0.9 (0.5)',
	part: 'What x steps play: chord, root, rootless, top or up',
	// settings, in the head or on a pattern
	tempo: 'Beats a minute',
	beats: 'Beats to a bar',
	steps: 'Steps to a beat',
	swing: '0 to 0.75, delays every other step',
	reverb: '0 to 1',
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
