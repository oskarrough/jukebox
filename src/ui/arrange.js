// The song's shape as you arrange it: the words on its play and loop lines,
// each a section of the song, and the score rewritten when you move, copy,
// remove or add one. The play line plays once, then the loop line goes round.
import { parse } from '../score.js'

const comment = (line) => {
	const m = line.match(/(^|\s)#/)
	return m ? m.index + m[1].length : line.length
}
const WORD = /^([A-Za-z_]\w*?)([+-]\d+)?(?:\*(\d+))?$/
const isLine = (kw) => (l) => new RegExp(`^\\s*${kw}\\b`, 'i').test(l)

// The play and loop words of `text`, as { line, word, name, trans, times }.
// A song without either loops every pattern in order.
export function arrangement(text) {
	const lines = text.split('\n')
	const out = { play: [], loop: [], implicit: false }
	for (const kw of ['play', 'loop'])
		for (const l of lines.filter(isLine(kw)))
			for (const word of l.slice(0, comment(l)).trim().split(/\s+/).slice(1)) {
				const m = WORD.exec(word)
				if (m) out[kw].push({ line: kw, word, name: m[1], trans: m[2] ? +m[2] : 0, times: m[3] ? Math.min(64, +m[3]) : 1 })
			}
	if (!out.play.length && !out.loop.length) {
		out.implicit = true
		out.loop = parse(text).song.patternOrder.map((name) => ({ line: 'loop', word: name, name, trans: 0, times: 1 }))
	}
	return out
}

// Every section of `song` (compiled from `text`) in play order, with where it
// starts and how long it lasts in seconds: one per word, a *2 one twice as
// long. While the text and the song disagree (half typed), one per section,
// and `fixed` so nothing moves.
export function sectionsOf(text, song) {
	if (!song) return { all: [], fixed: true }
	const { play, loop } = arrangement(text)
	const all = []
	let fixed = false
	const walk = (words, tl, off) => {
		let k = 0
		for (const w of words) {
			const secs = tl.sections.slice(k, (k += w.times))
			if (secs.length !== w.times || secs.some((s) => s.name !== w.name || s.trans !== w.trans)) fixed = true
			else all.push({ ...w, i: all.length, start: off + secs[0].start, dur: secs.reduce((n, s) => n + s.dur, 0), ln: secs[0].ln })
		}
		if (k !== tl.sections.length) fixed = true
	}
	walk(play, song.intro, 0)
	walk(loop, song.loop, song.intro.dur)
	if (!fixed) return { all, fixed }
	return {
		all: [
			...song.intro.sections.map((s) => ({ ...s, line: 'play' })),
			...song.loop.sections.map((s) => ({ ...s, line: 'loop', start: song.intro.dur + s.start })),
		].map((s, i) => ({ i, line: s.line, word: s.name, name: s.name, trans: s.trans, times: 1, start: s.start, dur: s.dur, ln: s.ln })),
		fixed,
	}
}

// The sections `list` with section `from` moved, or copied, to the gap before
// `to` (counted before the move). It stays on its own line unless it lands
// well inside the other one. Returns null if that would leave nothing to loop.
export function reorder(list, from, to, copy) {
	const intro = list.filter((s) => s.line === 'play').length
	const item = list[from]
	const line = to < intro ? 'play' : to > intro ? 'loop' : item.line
	const out = list.slice()
	out.splice(to, 0, { ...item, line, moved: true })
	if (!copy) out.splice(to <= from ? from + 1 : from, 1)
	return out.some((s) => s.line === 'loop') ? out : null
}

// `text` with its play and loop lines saying `list` (from arrangement or
// reorder), each keeping its comment; an empty play line goes.
export function writeOrder(text, list) {
	const lines = text.split('\n')
	const end = lines.at(-1) === '' ? lines.length - 1 : lines.length
	for (const kw of ['play', 'loop']) {
		const words = list.filter((s) => s.line === kw).map((s) => s.word)
		const at = lines.flatMap((l, i) => (l != null && isLine(kw)(l) ? [i] : []))
		for (const i of at.slice(1)) lines[i] = null
		if (at.length) {
			const l = lines[at[0]]
			const head = /^\s*\w+/.exec(l)[0]
			const c = comment(l)
			lines[at[0]] = words.length ? `${head} ${words.join(' ')}${c < l.length ? ` ${l.slice(c)}` : ''}` : null
		} else if (words.length) {
			const loop = lines.findIndex((l) => l != null && isLine('loop')(l))
			if (kw === 'play' && loop >= 0) lines.splice(loop, 0, `play ${words.join(' ')}`)
			else lines.splice(end, 0, ...(lines[end - 1]?.trim() ? [''] : []), `${kw} ${words.join(' ')}`)
		}
	}
	return lines.filter((l) => l != null).join('\n')
}

// Moves or copies section `from` to the gap before `to`.
export function moveSection(text, from, to, copy) {
	const { play, loop } = arrangement(text)
	const next = reorder([...play, ...loop], from, to, copy)
	return next ? writeOrder(text, next) : text
}

// Takes section `i` out of the song; its pattern stays in the score. The
// last one left to loop stays.
export function removeSection(text, i) {
	const { play, loop } = arrangement(text)
	const list = [...play, ...loop]
	list.splice(i, 1)
	return list.some((s) => s.line === 'loop') ? writeOrder(text, list) : text
}

const MUSIC = /^([A-Za-z_]\w*)(?:@\d+)?\s*\|/
const strip = (line) => line.replace(/(^|\s)#.*$/, '').trim()

// A new pattern from pattern `base`, written after the last pattern and
// added to the end of the loop: { text, name }. It's named after its base,
// counting up: A2 from A, A3 from A2.
export function addSection(text, base) {
	const { song } = parse(text)
	if (!song.patterns[base]) return { text, name: null }
	const stem = base.replace(/\d+$/, '')
	let n = 2
	while (song.patterns[stem + n]) n++
	const name = stem + n
	const lines = text.split('\n')
	const lastPattern = Math.max(...Object.values(song.patterns).map((p) => p.ln - 1))
	let end = lastPattern
	for (let i = lastPattern + 1; i < lines.length; i++) {
		const l = strip(lines[i])
		if (!l) continue
		if (!MUSIC.test(l) && !/^mute\b/i.test(l)) break
		end = i
	}
	lines.splice(end + 1, 0, '', `pattern ${name} from ${base}`)
	const grown = lines.join('\n')
	const { play, loop, implicit } = arrangement(grown)
	const list = [...play, ...loop]
	if (!implicit) list.push({ line: 'loop', word: name })
	return { text: writeOrder(grown, list), name }
}

// Section `i` played `times` times in a row: A*4.
export function repeatSection(text, i, times) {
	const { play, loop } = arrangement(text)
	const list = [...play, ...loop]
	const s = list[i]
	if (!s) return text
	const trans = s.trans ? (s.trans > 0 ? '+' : '') + s.trans : ''
	list[i] = { ...s, times, word: s.name + trans + (times > 1 ? `*${times}` : '') }
	return writeOrder(text, list)
}

// Where each section of `list` sits on a strip as wide as the whole song:
// `left` and `width` as fractions of it.
export function layout(list) {
	const T = list.reduce((n, s) => n + s.dur, 0) || 1
	let t = 0
	return list.map((s) => {
		const out = { ...s, left: t / T, width: s.dur / T }
		t += s.dur
		return out
	})
}

// Every arrangement a drag of section `from` in `list` (from sectionsOf) can
// lead to, the held section marked `moved`: by its edge, { times, list }
// for each count from 1 to 16; else { to, copy, list } for each gap it can
// be moved or copied to, and { away, list } taken out, unless it's the last
// one left to loop.
export function dragStates(list, from, edge) {
	const s = list[from]
	if (edge) {
		const trans = s.trans ? (s.trans > 0 ? '+' : '') + s.trans : ''
		return Array.from({ length: 16 }, (_, k) => {
			const times = k + 1
			const word = s.name + trans + (times > 1 ? `*${times}` : '')
			const held = { ...s, times, word, dur: (s.dur / s.times) * times, moved: true }
			return { times, list: list.map((x, i) => (i === from ? held : x)) }
		})
	}
	const out = []
	for (const copy of [false, true])
		for (let to = 0; to <= list.length; to++) {
			const next = reorder(list, from, to, copy)
			if (next) out.push({ to, copy, list: copy ? next.map((x) => (x.moved ? { ...x, copy } : x)) : next })
		}
	if (list.some((x, i) => i !== from && x.line === 'loop'))
		out.push({ away: true, list: list.map((x, i) => (i === from ? { ...x, gone: true } : x)) })
	return out
}

// The state of `states` whose point, by `where(state)`, is nearest `pointer`.
export function nearest(states, where, pointer) {
	let best = null
	let far = Infinity
	for (const s of states) {
		const p = where(s)
		const d = Math.hypot(p.x - pointer.x, p.y - pointer.y)
		if (d < far) [best, far] = [s, d]
	}
	return best
}

// Whether arrangement `state` (from dragStates) plays as `list` already does.
export const unchanged = (state, list) =>
	!state.away && state.list.length === list.length && state.list.every((s, i) => s.word === list[i].word && s.line === list[i].line)
