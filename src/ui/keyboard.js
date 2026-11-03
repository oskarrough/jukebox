// The computer keyboard as a piano, by where the keys are rather than what's
// printed on them. The home row, A S D F G H J K L ; ', plays the song's
// scale from its keynote, so nothing played there is out of key; the row
// above plays the notes in between, W between A and S and so on, where the
// scale leaves a gap. Z and X an octave down and up.
import { prefersFlats, scaleSteps, transposeNoteName } from '../key.js'
import { noteToMidi } from '../score.js'

export const HOME = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote']
// Each sits between HOME[i] and HOME[i + 1].
export const ABOVE = ['KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft']
export const OCTAVE_KEYS = { KeyZ: -1, KeyX: 1 }
export const keyLabel = (code) => ({ Semicolon: ';', Quote: "'", BracketLeft: '[' })[code] ?? code.replace('Key', '')

// The visible keyboard uses exactly the mapping the computer keys play.
export function pianoKeys(octave, key) {
	return HOME.flatMap((code, i) => [
		{ code, note: noteOf(code, octave, key), column: i, above: false },
		...(ABOVE[i] && noteOf(ABOVE[i], octave, key) ? [{ code: ABOVE[i], note: noteOf(ABOVE[i], octave, key), column: i, above: true }] : []),
	])
}

// Semitones above the keynote of the scale's `i`th note, from 0.
const degree = (i, minor) => scaleSteps({ minor })[i % 7] + 12 * Math.floor(i / 7)

// The note key `code` plays in `key` (C major without one), its keynote in
// `octave`; or null.
export function noteOf(code, octave, key) {
	let semis = null
	const i = HOME.indexOf(code)
	const j = ABOVE.indexOf(code)
	if (i >= 0) semis = degree(i, key?.minor)
	else if (j >= 0 && degree(j + 1, key?.minor) - degree(j, key?.minor) > 1) semis = degree(j, key?.minor) + 1
	return semis == null ? null : transposeNoteName(`C${octave}`, (key?.pc ?? 0) + semis, prefersFlats(key))
}

// The octave to play the line at `pos` in: where the keynote of `key` sits at
// or below the line's lowest note, so playing doesn't creep up the line; or null.
export function octaveAt(text, pos, key) {
	const start = text.lastIndexOf('\n', pos - 1) + 1
	const end = text.indexOf('\n', pos)
	const line = text
		.slice(start, end < 0 ? text.length : end)
		.replace(/^\s*\S+/, '')
		.replace(/(^|\s)#.*$/, '')
	const notes = [...line.matchAll(/[A-G](?:##|bb|#|b|q)?\d/g)].map((m) => noteToMidi(m[0])).filter((m) => m != null)
	return notes.length ? Math.floor((Math.min(...notes) - (key?.pc ?? 0)) / 12) - 1 : null
}
