// Suggestions while you write, on every line: settings, voice, pattern, play
// and loop at the start of a line, the song's voices inside a pattern,
// instruments and options on a voice line, pattern names on play and loop
// lines. Read from the text, so they're there before it compiles. Where the
// next word comes from a fixed list, the whole list is there once you reach
// it, before you type. On an empty line only the likeliest next thing is
// offered, for the ghost after the caret, unless you ask for them all.
import { CHORDS, DRUMS, LOW, MELODIC, OPTIONS, PARTS, PATTERN_OPTIONS, SETTINGS, noteToMidi, parse } from '../score.js'
import { prefersFlats, transposeNoteName } from '../key.js'
import { INSTRUMENTS as SOUNDS } from '../instruments.js'
import { HINTS, START } from './hints.js'

export const INSTRUMENTS = [...MELODIC, ...DRUMS]
// The instruments in the guide's order, each with its group and how it sounds.
const LISTED = SOUNDS.map((i) => i.name)
const ABOUT = Object.fromEntries(SOUNDS.map((i) => [i.name, { group: i.group, hint: i.sound }]))
const about = (w) => ABOUT[w] ?? {}
const told = (w) => ({ hint: HINTS[w] })

// A note to hear `inst` by: the key's root, or a drum hit.
export function sample(inst, key) {
	if (DRUMS.includes(inst)) return 'x'
	return `${key.letter}${key.acc}${LOW.has(inst) ? 2 : 4}`
}

// What could finish the word ending at `pos` in `text`: { start, end, items,
// quiet, likely, free }, each item { word, insert, inst, group, hint }; or
// null. Quiet ones are only for the ghost, not worth a menu. `likely`: the
// first item is the likeliest, for the ghost. `free`: nothing has to be
// written here, so none is picked yet. `key` is the song's key; `all` asks
// for every choice at the caret, even on an empty line.
export function suggest(text, pos, key, all = false) {
	const lineStart = text.lastIndexOf('\n', pos - 1) + 1
	const before = text.slice(lineStart, pos)
	if (/\S/.test(text[pos] ?? '') || /(^|\s)#/.test(before)) return null
	const word = /\w*$/.exec(before)[0]
	const start = pos - word.length
	// Nothing written yet in a slot that's been reached: after its space, or asked for.
	const blank = !word && (all || /\s$/.test(before))
	const above = text.slice(0, lineStart).split('\n').slice(0, -1)
	const names = (re) => [...new Set([...text.matchAll(re)].map((m) => m[1]))]
	const voices = names(/^[ \t]*voice[ \t]+(\S+)/gim)
	const patterns = names(/^[ \t]*pattern[ \t]+(\S+)/gim)
	// The words starting with the one being written, each written in as `write` has it.
	const offer = (list, write = (w) => w + ' ', { say = () => ({}), likely = false, free = false } = {}) => {
		const lower = word.toLowerCase()
		const items = [...new Set(list)]
			.filter((w) => w.toLowerCase().startsWith(lower) && w !== word)
			.map((w) => ({ word: w, insert: write(w), inst: INSTRUMENTS.includes(w), ...say(w) }))
		return items.length ? { start, end: pos, items, quiet: false, likely: likely && !word, free: free && !word } : null
	}
	// Only the next thing, written in at the caret.
	const next = (insert) => (insert ? { start: pos, end: pos, items: [{ word: insert, insert }], quiet: true } : null)
	const last = (re) => above.findLastIndex((l) => re.test(l))
	const fresh = !above.length || !above.at(-1).trim()
	let m

	if (/^\s*\w*$/.test(before)) {
		const pattern = last(/^\s*pattern\b/i)
		const tail = last(/^\s*(play|loop)\b/i)
		const lines = (list, likely, write = (w) => w + ' ') => {
			if (word) return offer(list, write, { say: told })
			if (all) return offer(likely ? [likely, ...list] : list, write, { say: told, likely: !!likely, free: true })
			return next(likely && write(likely))
		}
		// The head, before the first pattern.
		if (pattern < 0) {
			const used = new Set(above.map((l) => /^(\w+)/.exec(l)?.[1].toLowerCase()))
			return lines(
				[...SETTINGS.filter((s) => !used.has(s)), 'voice', 'pattern', 'play', 'loop'],
				voices.length && fresh ? 'pattern' : 'voice',
			)
		}
		// After a play or loop line.
		if (tail > pattern) return lines(['pattern', 'play', 'loop'], fresh && 'pattern')
		// Inside a pattern: its voices and chord row, then whatever ends it.
		const written = new Set(above.slice(pattern + 1).map((l) => /^\s*(\w+)(@\d+)?\s*\|/.exec(l)?.[1]))
		const left = voices.filter((v) => !written.has(v))
		const bars = (w) => w + (voices.includes(w) || w === 'chords' ? ' | ' : ' ')
		const say = (w) => (voices.includes(w) ? {} : told(w))
		const list = [...voices, 'chords', 'mute', 'pattern', 'play', 'loop']
		if (word) return offer(list, bars, { say })
		const likely = fresh ? 'pattern' : left[0]
		if (all) return offer(likely ? [likely, ...list] : list, bars, { say, likely: !!likely, free: true })
		return next(likely && bars(likely))
	}
	// Picking an instrument for the name names the voice after it: shaker, shaker2.
	if (/^\s*voice\s+\w*$/i.test(before) && (word || blank)) {
		const named = (inst) => {
			const base = inst === '808' ? 'sub' : inst
			let name = base
			for (let n = 2; voices.includes(name); n++) name = base + n
			return `${name} ${inst} `
		}
		return offer(LISTED, named, { say: about, free: true })
	}
	if ((m = /^\s*voice\s+(\S+)\s+\w*$/i.exec(before))) {
		// A voice called kick probably plays a kick; those come first.
		const name = m[1].toLowerCase()
		const near = LISTED.filter((w) => w.startsWith(name) || name.startsWith(w))
		const s = offer([...near, ...LISTED], undefined, { say: about, likely: near.length > 0, free: !near.length })
		for (const item of s?.items ?? []) if (near.includes(item.word)) item.group = ''
		return s
	}
	if (/^\s*voice\s+\S+\s+\S+\s.*\bpart=\w*$/i.test(before)) return offer(PARTS)
	if ((m = /^\s*voice\s+\S+\s+(\S+)\s/i.exec(before)))
		return word || blank
			? offer(
					OPTIONS.filter((o) => !new RegExp(`\\s${o}=`, 'i').test(before) && !(o === 'part' && DRUMS.includes(m[1].toLowerCase()))),
					(w) => `${w}=${START[w] ?? ''}`,
					{ say: told, free: true },
				)
			: null
	if (/^\s*pattern\s+\w*$/i.test(before)) return word ? null : next([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find((l) => !patterns.includes(l)))
	if ((m = /^\s*pattern\s+(\S+)\s+from\s+\w*$/i.exec(before))) {
		const others = patterns.filter((p) => p !== m[1])
		if (word) return offer(others)
		return blank ? offer([others.at(-1), ...others].filter(Boolean), undefined, { likely: true }) : null
	}
	if (/^\s*pattern\s+\S+\s/i.test(before))
		return word || blank
			? offer(['from', ...PATTERN_OPTIONS], (w) => (w === 'from' ? 'from ' : `${w}=${START[w]}`), { say: told, free: true })
			: null
	if ((m = /^\s*(play|loop)\s(.*?)\w*$/i.exec(before))) {
		if (word) return offer(patterns)
		if (!blank) return null
		const prev = /(\w+)\S*\s*$/.exec(m[2])?.[1]
		const likely = patterns[prev ? patterns.indexOf(prev) + 1 : 0]
		return offer(likely ? [likely, ...patterns] : patterns, undefined, { likely: !!likely, free: true })
	}
	if (/^\s*mute\s/i.test(before)) {
		const muted = before.split(/\s+/)
		return word || blank
			? offer(
					voices.filter((v) => !muted.includes(v)),
					undefined,
					{ free: true },
				)
			: null
	}
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
