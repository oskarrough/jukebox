// Suggestions while you write: instruments and options on a voice line,
// voice names starting a music line or after mute, pattern names on play and
// loop lines. Read from the text, so they're there before it compiles.
import { DRUMS, MELODIC, OPTIONS } from '../score.js'

const INSTRUMENTS = [...MELODIC, ...DRUMS]

// What could finish the word ending at `pos` in `text`: { start, end, items },
// each item { word, insert }; or null.
export function suggest(text, pos) {
	const lineStart = text.lastIndexOf('\n', pos - 1) + 1
	const before = text.slice(lineStart, pos)
	if (/\S/.test(text[pos] ?? '')) return null
	const word = /\w*$/.exec(before)[0]
	const start = pos - word.length
	const names = (re) => [...new Set([...text.matchAll(re)].map((m) => m[1]))]
	let list = null
	let tail = ' '
	if (/^\s*voice\s+\S+\s+\w*$/i.test(before)) list = INSTRUMENTS
	else if (word && /^\s*voice\s+\S+\s+\S+\s(.*\s)?\w*$/i.test(before)) [list, tail] = [OPTIONS, '=']
	else if (word && /^\s*(play|loop)\s/i.test(before)) list = names(/^\s*pattern\s+(\S+)/gim)
	else if (word && /^\s*mute\s/i.test(before)) list = names(/^\s*voice\s+(\S+)/gim)
	else if (word && /^\s*\w+$/.test(before) && /^\s*pattern\s/im.test(text.slice(0, lineStart))) {
		list = names(/^\s*voice\s+(\S+)/gim)
		tail = ' | '
	}
	const lower = word.toLowerCase()
	const items = (list ?? []).filter((w) => w.toLowerCase().startsWith(lower) && w !== word).slice(0, 8)
	if (!items.length) return null
	return { start, end: pos, items: items.map((w) => ({ word: w, insert: w + tail })) }
}
