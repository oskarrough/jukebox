// Suggestions while you write, on every line: settings, voice, pattern, play
// and loop at the start of a line, the song's voices inside a pattern,
// instruments and options on a voice line, pattern names on play and loop
// lines. Read from the text, so they're there before it compiles. On an
// empty line, or where a word is due, only the likeliest next thing is
// offered, for the ghost after the caret.
import { CHORDS, DRUMS, LOW, MELODIC, OPTIONS, PARTS, PATTERN_OPTIONS, SETTINGS, noteToMidi, parse } from '../score.js'
import { prefersFlats, transposeNoteName } from '../key.js'

export const INSTRUMENTS = [...MELODIC, ...DRUMS]

// A note to hear `inst` by: the key's root, or a drum hit.
export function sample(inst, key) {
	if (DRUMS.includes(inst)) return 'x'
	return `${key.letter}${key.acc}${LOW.has(inst) ? 2 : 4}`
}

// What could finish the word ending at `pos` in `text`: { start, end, items,
// quiet }, each item { word, insert, inst }; or null. Quiet ones are only for
// the ghost, not worth a menu. `key` is the song's key.
export function suggest(text, pos, key) {
	const lineStart = text.lastIndexOf('\n', pos - 1) + 1
	const before = text.slice(lineStart, pos)
	if (/\S/.test(text[pos] ?? '') || /(^|\s)#/.test(before)) return null
	const word = /\w*$/.exec(before)[0]
	const start = pos - word.length
	const above = text.slice(0, lineStart).split('\n').slice(0, -1)
	const names = (re) => [...new Set([...text.matchAll(re)].map((m) => m[1]))]
	const voices = names(/^\s*voice\s+(\S+)/gim)
	const patterns = names(/^\s*pattern\s+(\S+)/gim)
	// The words starting with the one being written; `tail` follows each.
	const offer = (list, tail = () => ' ') => {
		const lower = word.toLowerCase()
		const items = [...new Set(list)]
			.filter((w) => w.toLowerCase().startsWith(lower) && w !== word)
			.slice(0, 8)
			.map((w) => ({ word: w, insert: w + tail(w), inst: INSTRUMENTS.includes(w) }))
		return items.length ? { start, end: pos, items, quiet: false } : null
	}
	// Only the next thing, written in at the caret.
	const next = (insert) => (insert ? { start: pos, end: pos, items: [{ word: insert, insert }], quiet: true } : null)
	const last = (re) => above.findLastIndex((l) => re.test(l))
	const fresh = !above.length || !above.at(-1).trim()
	let m

	if (/^\s*\w*$/.test(before)) {
		const pattern = last(/^\s*pattern\b/i)
		const tail = last(/^\s*(play|loop)\b/i)
		// The head, before the first pattern.
		if (pattern < 0) {
			const used = new Set(above.map((l) => /^(\w+)/.exec(l)?.[1].toLowerCase()))
			if (word) return offer([...SETTINGS.filter((s) => !used.has(s)), 'voice', 'pattern', 'play', 'loop'])
			return next(voices.length && fresh ? 'pattern ' : 'voice ')
		}
		// After a play or loop line.
		if (tail > pattern) return word ? offer(['pattern', 'play', 'loop']) : next(fresh ? 'pattern ' : null)
		// Inside a pattern: its voices and chord row, then whatever ends it.
		if (word)
			return offer([...voices, 'chords', 'mute', 'pattern', 'play', 'loop'], (w) => (voices.includes(w) || w === 'chords' ? ' | ' : ' '))
		const written = new Set(above.slice(pattern + 1).map((l) => /^\s*(\w+)(@\d+)?\s*\|/.exec(l)?.[1]))
		const left = voices.filter((v) => !written.has(v))
		return next(fresh ? 'pattern ' : left.length ? `${left[0]} | ` : null)
	}
	if (/^\s*voice\s+\w+$/i.test(before)) return offer(INSTRUMENTS)
	if ((m = /^\s*voice\s+(\S+)\s+\w*$/i.exec(before))) {
		// A voice called kick probably plays a kick.
		const name = m[1].toLowerCase()
		const near = INSTRUMENTS.filter((w) => w.startsWith(name) || name.startsWith(w))
		return offer([...near, ...INSTRUMENTS])
	}
	if (/^\s*voice\s+\S+\s+\S+\s.*\bpart=\w*$/i.test(before)) return offer(PARTS)
	if ((m = /^\s*voice\s+\S+\s+(\S+)\s/i.exec(before)))
		return word
			? offer(
					OPTIONS.filter((o) => !new RegExp(`\\s${o}=`, 'i').test(before) && !(o === 'part' && DRUMS.includes(m[1].toLowerCase()))),
					() => '=',
				)
			: null
	if (/^\s*pattern\s+\w*$/i.test(before)) return word ? null : next([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find((l) => !patterns.includes(l)))
	if ((m = /^\s*pattern\s+(\S+)\s+from\s+\w*$/i.exec(before))) {
		const others = patterns.filter((p) => p !== m[1])
		return word ? offer(others) : next(others.at(-1))
	}
	if (/^\s*pattern\s+\S+\s/i.test(before)) return word ? offer(['from', ...PATTERN_OPTIONS], (w) => (w === 'from' ? ' ' : '=')) : null
	if ((m = /^\s*(play|loop)\s(.*?)\w*$/i.exec(before))) {
		if (word) return offer(patterns)
		const prev = /(\w+)\S*\s*$/.exec(m[2])?.[1]
		return next(patterns[prev ? patterns.indexOf(prev) + 1 : 0])
	}
	if (/^\s*mute\s/i.test(before)) return word ? offer(voices) : null
	if ((m = /^\s*chords(@\d+)?\s*\|.*?([A-G][#b]?\S*)?$/.exec(before))) {
		if (m[2]) return chordNames(m[2], pos, key)
		if (/\|\s*$/.test(before) && !/\S/.test(text.slice(pos).split('\n')[0]))
			return /\|\s*\S/.test(before) ? null : next(`${before.endsWith('|') ? ' ' : ''}${progression(key)} |`)
		return null
	}
	if ((m = /^\s*([A-Za-z_]\w*)(@\d+)?\s*\|\s*$/.exec(before))) {
		const bar = firstBar(text, m[1], above, key)
		return bar && next(`${before.endsWith('|') ? ' ' : ''}${bar} |`)
	}
	return null
}

// The chords that could finish `written` on the chord row: the one the key
// makes on that root first, then its richer kinds, then the rest.
const KINDS = ['', 'm', '7', 'm7', 'maj7', 'm9', 'maj9', '9', 'm11', 'sus2', 'sus4', '6/9', 'add9', 'dim', '13']
function chordNames(written, pos, key) {
	const [, root] = /^([A-G][#b]?)/.exec(written)
	const pc = noteToMidi(`${root}4`) % 12
	const from = (((pc - (key?.pc ?? 0)) % 12) + 12) % 12
	// The scale's chords, from its root: major, or minor from the 3rd below.
	const own = key?.minor
		? { 0: 'm', 2: 'dim', 3: '', 5: 'm', 7: 'm', 8: '', 10: '' }
		: { 0: '', 2: 'm', 4: 'm', 5: '', 7: '', 9: 'm', 11: 'dim' }
	const first = own[from]
	const richer = first === 'm' ? ['m7', 'm9', 'm11'] : first === '' ? ['maj7', '7', '6/9', 'maj9'] : first === 'dim' ? ['m7b5'] : []
	const kinds = [...new Set([...(first == null ? [] : [first, ...richer]), ...KINDS])].filter((k) => k in CHORDS)
	const items = kinds
		.map((k) => root + k)
		.filter((w) => w.startsWith(written) && w !== written)
		.slice(0, 8)
		.map((w) => ({ word: w, insert: `${w} ` }))
	return items.length ? { start: pos - written.length, end: pos, items, quiet: false } : null
}

// Four bars of chords to start from, the ones most songs in the key use.
function progression(key) {
	const flats = prefersFlats(key)
	const at = (semis, kind) => transposeNoteName(`${key.letter}${key.acc}4`, semis, flats).slice(0, -1) + kind
	return (key.minor ? [at(0, 'm'), at(8, ''), at(3, ''), at(10, '')] : [at(0, ''), at(7, ''), at(9, 'm'), at(5, '')]).join(' | ')
}

// A first bar for voice `name`, to start from: a hit on every beat for a
// drum, the key's chord a note a beat for anything else.
function firstBar(text, name, above, key) {
	const { song } = parse(text)
	const voice = song.voiceMap[name]
	if (!voice) return null
	const pattern = /^\s*pattern\s+(\S+)/i.exec(above.findLast((l) => /^\s*pattern\b/i.test(l)) ?? '')?.[1]
	const opts = song.patterns[pattern]?.opts ?? {}
	const beats = opts.beats ?? song.beats
	const steps = opts.steps ?? song.steps
	const root = sample(voice.inst, key)
	const chord = [0, key.minor ? 3 : 4, 7, key.minor ? 3 : 4]
	return Array.from({ length: beats }, (_, i) =>
		voice.drum ? 'x' + '.'.repeat(steps - 1) : transposeNoteName(root, chord[i % 4], prefersFlats(key)) + '-'.repeat(steps - 1),
	).join(' ')
}
