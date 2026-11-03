// Nudging what's under the caret, with ⌥↑/↓ or an ⌥-drag: a note moves a
// semitone (an octave when `big`), a number by its last digit (ten of them),
// a drum step from . to o to x to X.
import { prefersFlats, transposeNoteName, transposeToken } from '../key.js'

const MUSIC = /^(\s*)([A-Za-z_]\w*)(?:@\d+)?\s*\|/
const DRUM_STEPS = '.oxX'

// What `dir` (+1 or -1) does at `pos` in `text`, given the song's `drums`
// (a Set of drum voice names) and `key`: { start, end, to, voice } to put `to`
// in place of start…end, the voice there if the change is a sound; or null.
export function nudge(text, pos, dir, big, drums, key) {
	const lineStart = text.lastIndexOf('\n', pos - 1) + 1
	const lineEnd = text.indexOf('\n', pos) < 0 ? text.length : text.indexOf('\n', pos)
	const line = text.slice(lineStart, lineEnd)
	const col = pos - lineStart
	const at = (start, end, to, voice) => ({ start: lineStart + start, end: lineStart + end, to, voice })
	// Comments stay as they are.
	const hash = line.search(/(^|\s)#/)
	if (hash >= 0 && col > hash) return null

	const music = MUSIC.exec(line)
	const inBars = music && col > line.indexOf('|')
	if (inBars && drums.has(music[2])) {
		// The step under the caret, or just before it.
		for (const c of [col, col - 1]) {
			const i = DRUM_STEPS.indexOf(line[c])
			if (i < 0) continue
			const to = DRUM_STEPS[Math.max(0, Math.min(DRUM_STEPS.length - 1, i + dir))]
			return to === line[c] ? null : at(c, c + 1, to, to === '.' ? null : music[2])
		}
		return null
	}

	// The word around the caret.
	let start = col
	let end = col
	while (start > 0 && !/[\s|]/.test(line[start - 1])) start--
	while (end < line.length && !/[\s|]/.test(line[end])) end++
	const word = line.slice(start, end)
	if (!word) return null
	const flats = prefersFlats(key)
	if (inBars) {
		const to = transposeToken(word, dir * (big ? 12 : 1), flats)
		return to === word ? null : at(start, end, to, music[2])
	}
	// A note name in an option: center=E4.
	const note = /=([A-Ga-g](?:##|bb|#|b|q)?[0-8])$/.exec(word)
	if (note) return at(end - note[1].length, end, transposeNoteName(note[1], dir * (big ? 12 : 1), flats))
	// A number: tempo 112, vol=0.5, pan=-0.2, lead@2.
	for (const m of word.matchAll(/(?:(?<=^|=)-)?\d+(?:\.\d+)?/g)) {
		const a = start + m.index
		const z = a + m[0].length
		if (col < a || col > z) continue
		const places = m[0].split('.')[1]?.length ?? 0
		const step = 10 ** -places * (big ? 10 : 1)
		let to = (Number(m[0]) + dir * step).toFixed(places)
		if (/^-0(\.0*)?$/.test(to)) to = to.slice(1)
		return at(a, z, to)
	}
	return null
}
