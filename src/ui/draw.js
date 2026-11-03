// Drawing on the tape, as text: where a moment on the roll is in the score,
// and the notes and drum hits you add, move, stretch or delete there written
// into the bar that plays them, the way you'd type it. A bar that repeats
// the one before (%) or holds (=) is written out first; a bar a pattern
// takes from the one it's built on gets a `voice@N` line of its own, so the
// other pattern stays as it was. Where that can't be done, the edit is null.
import { compile, noteToMidi, parse } from '../score.js'
import { prefersFlats, transposeToken } from '../key.js'
import { barAt, columnOf } from './link.js'

const T_HOLD = /^-+$/
const T_REST = /^(\.+)(-*)$/
const NOTE = '[A-Ga-g](?:##|bb|#|b|q)?[0-8]'
const T_NOTE = new RegExp(`^(~?)(\\[[^\\]]+\\]|${NOTE}(?:\\+${NOTE})*)([!?]*)(-*)([!?]*)$`)
const NAME = new RegExp(`(?<![\\w#])(${NOTE.slice(0, -5)})([0-8])(?![\\w#])`, 'g')
const SCALE = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] }
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const pcOf = (m) => ((m % 12) + 12) % 12

let last = { text: null, song: null }
const parsedOf = (text) => (last.text === text ? last.song : (last = { text, song: parse(text).song }).song)

// The section a place is in: { tl: 'intro' | 'loop', i } of `song`.
const sectionOf = (song, place) => song[place.tl]?.sections[place.i]
const stepDur = (sec) => 60 / sec.tempo / sec.steps

// The swing of pattern `name`: its own, the one it's built on, or the song's.
function swingOf(text, sec) {
	const song = parsedOf(text)
	for (let p = song.patterns[sec.name], seen = 0; p && seen < 32; p = song.patterns[p.from], seen++)
		if (p.opts.swing != null) return sec.steps % 2 ? 0 : p.opts.swing
	return sec.steps % 2 ? 0 : song.swing
}

// Where `t` seconds from the song's start is: the section, the turn of the
// loop it's on (`off`, when that turn starts), its bar `b`, the step `st` in
// the bar and `x`, the step with its fraction.
export function placeAt(text, song, t) {
	let tl = 'intro'
	let off = 0
	if (t >= song.intro.dur) {
		if (!song.loop.dur) return null
		tl = 'loop'
		off = song.intro.dur + Math.floor((t - song.intro.dur) / song.loop.dur) * song.loop.dur
	}
	const local = t - off
	const i = song[tl].sections.findIndex((s) => local >= s.start && local < s.start + s.dur)
	if (i < 0) return null
	const sec = song[tl].sections[i]
	const n = sec.beats * sec.steps
	const b = Math.min(sec.bars - 1, Math.floor((local - sec.start) / sec.barDur))
	const x = (local - sec.start - b * sec.barDur) / stepDur(sec)
	let st = Math.floor(x)
	if (st % 2 === 1 && x - st < swingOf(text, sec)) st--
	return { tl, i, off, b, st: Math.max(0, Math.min(n - 1, st)), x }
}

// When step `st` of a place's bar starts, in seconds from the song's start.
export function timeAt(text, song, place, st = place.st) {
	const sec = sectionOf(song, place)
	const sw = st % 2 === 1 ? swingOf(text, sec) : 0
	return place.off + sec.start + place.b * sec.barDur + (st + sw) * stepDur(sec)
}

// The pitch to write nearest `m` (a written midi number, with a fraction):
// in the song's `key`, or one this section already plays, quarter tones too.
export function snap(song, place, m, key) {
	const sec = sectionOf(song, place)
	const allowed = new Set(SCALE[key?.minor ? 'minor' : 'major'].map((d) => (d + (key?.pc ?? 0)) % 12))
	for (const e of song[place.tl].events) {
		const v = song.voices[e.v]
		if (e.s === place.i && e.m) for (const p of e.m) allowed.add(pcOf(p - v.trans - sec.trans))
	}
	let best = Math.round(m)
	for (const pc of allowed)
		for (const o of [-12, 0, 12]) {
			const c = Math.floor(m / 12) * 12 + pc + o
			if (Math.abs(c - m) < Math.abs(best - m) || !allowed.has(pcOf(best))) best = c
		}
	return best
}

// How the score spells midi number `m`: the way it already writes that
// pitch most often, else in sharps or flats as the key does.
export function nameOf(text, m, key) {
	const counts = new Map()
	for (const line of text.split('\n')) {
		const bars = line
			.replace(/(^|\s)#.*$/, '')
			.split('|')
			.slice(1)
			.join('|')
		for (const [, name] of bars.matchAll(NAME)) {
			const pc = pcOf(noteToMidi(name + 4))
			const seen = counts.get(pc) ?? new Map()
			seen.set(name, (seen.get(name) ?? 0) + 1)
			counts.set(pc, seen)
		}
	}
	const seen = counts.get(pcOf(m))
	const name = seen ? [...seen].sort((a, b) => b[1] - a[1])[0][0] : (prefersFlats(key) ? FLAT : SHARP)[pcOf(Math.round(m))]
	for (let o = Math.floor(m / 12) - 2; o <= Math.floor(m / 12) + 1; o++) if (o >= 0 && o <= 8 && noteToMidi(name + o) === m) return name + o
	return null
}

// A melodic bar as notes: { tie, notes: [{ st, len, pre, head, marks }] }
// with `tie` steps held over from the bar before, plus how it's written,
// `groups` of the text each covering some steps, to keep what an edit leaves
// alone. Null if it doesn't add up to `n` steps.
function readBar(src, n) {
	const s = src.trim()
	if (s === '_') return { tie: 0, notes: [], groups: [{ st: 0, len: n, kind: 'rest', text: s }] }
	if (s === '=') return { tie: n, notes: [], groups: [{ st: 0, len: n, kind: 'tie', text: s }] }
	const notes = []
	const groups = []
	let pos = 0
	let tie = 0
	let note = null
	for (const tok of s.split(/\s+/)) {
		let m
		if (T_HOLD.test(tok)) {
			if (note && note.st + note.len === pos) {
				note.len += tok.length
				groups.at(-1).len += tok.length
				groups.at(-1).text += ` ${tok}`
			} else {
				if (pos === tie) tie += tok.length
				groups.push({ st: pos, len: tok.length, kind: pos < tie ? 'tie' : 'rest', text: tok })
			}
			pos += tok.length
		} else if (T_REST.test(tok)) {
			groups.push({ st: pos, len: tok.length, kind: 'rest', text: tok })
			pos += tok.length
			note = null
		} else if ((m = T_NOTE.exec(tok))) {
			note = { st: pos, len: 1 + m[4].length, pre: m[1], head: m[2], marks: m[3] + m[5] }
			notes.push(note)
			groups.push({ st: pos, len: note.len, kind: 'note', text: tok, note: { ...note } })
			pos += note.len
		} else return null
	}
	return pos === n ? { tie, notes, groups } : null
}

const sameNote = (a, b) => a.st === b.st && a.len === b.len && a.pre === b.pre && a.head === b.head && a.marks === b.marks
const token = (nt) => nt.pre + nt.head + nt.marks + '-'.repeat(nt.len - 1)

// Writes `next` (from readBar, changed) back over `src`, keeping every word
// whose steps sound the same as before.
function writeBar(src, old, next, n) {
	const owner = Array(n).fill(null)
	for (let k = 0; k < next.tie; k++) owner[k] = 'tie'
	for (const nt of next.notes) for (let k = nt.st; k < nt.st + nt.len && k < n; k++) owner[k] = nt
	const kept = (g) =>
		g.kind === 'note'
			? next.notes.some((nt) => sameNote(nt, g.note))
			: owner.slice(g.st, g.st + g.len).every((o) => o === (g.kind === 'tie' ? 'tie' : null))
	const single = old.groups.some((g) => g.kind === 'rest') && old.groups.every((g) => g.kind !== 'rest' || g.len === 1)
	const out = []
	let p = 0
	while (p < n) {
		const g = old.groups.find((g) => g.st === p)
		if (g && kept(g)) {
			out.push(g.text)
			p += g.len
			continue
		}
		let q = p + 1
		while (q < n && !old.groups.some((g) => g.st === q && kept(g))) q++
		// what sounds from p to q, written fresh
		while (p < q) {
			const o = owner[p]
			if (o && o !== 'tie' && o.st === p) {
				out.push(token(o))
				p += o.len
				continue
			}
			let z = p + 1
			while (z < q && owner[z] === o) z++
			if (o === null) out.push(...(single ? Array(z - p).fill('.') : ['.'.repeat(z - p)]))
			else out.push('-'.repeat(z - p))
			p = z
		}
	}
	const lead = /^\s*/.exec(src)[0] || ' '
	const trail = /\s*$/.exec(src)[0] || ' '
	return lead + out.join(' ') + trail
}

// A drum bar as its steps, `.` `o` `x` `X`, or null if it isn't `n` of them.
function readDrums(src, n) {
	const s = src.replace(/\s+/g, '')
	if (s === '_') return Array(n).fill('.')
	if (s.length !== n || /[^.oxX-]/.test(s)) return null
	return [...s.replace(/-/g, '.')]
}
function writeDrums(src, hits, beat) {
	const s = src.replace(/\s+/g, '')
	let i = 0
	if (s.length === hits.length && s !== '_') return src.replace(/\S/g, () => hits[i++])
	const words = []
	for (let k = 0; k < hits.length; k += beat) words.push(hits.slice(k, k + beat).join(''))
	return ` ${words.join(' ')} `
}

// The text that sounds in bar `b` of a voice written where `where` says:
// a % is the bar before it (without what that bar held over).
function sourceOf(lines, where, b, drum) {
	const w = where[b]
	if (!w || w.k < 0) return null
	const bar = barAt(lines[w.ln - 1] ?? '', w.k)
	if (!bar) return null
	if (bar.text.trim() !== '%') return bar.text
	const prev = b > 0 ? sourceOf(lines, where, b - 1, drum) : null
	if (prev == null || drum) return prev
	if (prev.trim() === '=') return ' _ '
	return prev.replace(/^(\s*)((?:-+\s+)*-+)(?=\s|$)/, (_, sp, ties) => sp + ties.replace(/-/g, '.'))
}

// Whether `voice` is muted in pattern `name`, as compiling works it out.
function mutedIn(patterns, name, voice, seen = new Set()) {
	const p = patterns[name]
	if (!p || seen.has(name)) return false
	seen.add(name)
	let muted = p.from ? mutedIn(patterns, p.from, voice, seen) : false
	if (p.voiceOrder.includes(voice)) muted = false
	if (p.mute.has(voice)) muted = true
	return muted
}

// The lines of the pattern starting on line `ln` (from 1): [first, last].
function blockOf(lines, ln) {
	let z = ln
	while (z < lines.length && !/^\s*(pattern|play|loop)\b/i.test(lines[z])) z++
	return [ln, z]
}

// Why bar `b` of `voice` in a place's section can't be written, or null.
export function blocked(text, song, place, voice) {
	const sec = sectionOf(song, place)
	if (!sec) return 'gone'
	if (!sec.where?.[voice]?.[place.b] && mutedIn(parsedOf(text).patterns, sec.name, voice)) return 'muted'
	return null
}

// Changes bar `place.b` of `voice` in the place's section with `change`,
// which gets the bar (readBar's, or a drum bar's steps) and returns it
// changed, or null. Returns { text, ln, col } with the caret on step `st`.
function editBar(text, song, place, voice, change, st) {
	const sec = sectionOf(song, place)
	const v = song.voices.find((w) => w.name === voice)
	if (!sec || !v || place.b >= sec.bars) return null
	const n = sec.beats * sec.steps
	const lines = text.split('\n')
	const [lo, hi] = blockOf(lines, sec.ln)
	const mine = (ln) => ln >= lo && ln <= hi
	const where = sec.where?.[voice] ?? []
	const b = place.b
	let src = '_'
	let to
	if (where[b]) {
		src = sourceOf(lines, where, b, v.drum)
		if (src == null) return null
		to = mine(where[b].ln) ? { ln: where[b].ln, k: where[b].k } : { patch: true }
	} else {
		if (mutedIn(parsedOf(text).patterns, sec.name, voice)) return null
		const end = where.at(-1)
		to = end && mine(end.ln) ? { extend: end.ln, pad: b - where.length } : where.length ? { patch: true } : { add: true }
	}
	const old = v.drum ? readDrums(src, n) : readBar(src, n)
	if (!old) return null
	const next = change(v.drum ? [...old] : { tie: old.tie, notes: old.notes.map((nt) => ({ ...nt })) }, n)
	if (!next) return null
	const bar = v.drum ? writeDrums(src, next, sec.steps) : writeBar(src, old, next, n)
	// The new bar into its line, or a line of its own.
	let ln
	let k
	if (to.ln) {
		;({ ln, k } = to)
		const line = lines[ln - 1]
		const at = barAt(line, k)
		lines[ln - 1] = line.slice(0, at.start) + bar + line.slice(at.end)
	} else if (to.extend) {
		ln = to.extend
		const line = lines[ln - 1]
		const close = line.lastIndexOf('|')
		if (line.slice(close + 1).trim() && !/^\s*#/.test(line.slice(close + 1))) return null
		k = line.slice(0, close + 1).split('|').length - 2 + to.pad
		lines[ln - 1] = line.slice(0, close + 1) + ' _ |'.repeat(to.pad) + bar + '|' + line.slice(close + 1)
	} else {
		// After the pattern's last line that isn't blank or a comment, lined up
		// with its other voices.
		let at = hi
		while (at > lo && (!lines[at - 1].trim() || /^\s*#/.test(lines[at - 1]))) at--
		const music = lines.slice(lo - 1, hi).find((l) => /^\s*[A-Za-z_]\w*(?:@\d+)?\s*\|/.test(l)) ?? ''
		const label = to.patch ? `${voice}@${b + 1}` : voice
		const width = music.indexOf('|')
		const head = label.length < width ? label.padEnd(width) : `${label} `
		k = to.patch ? 0 : b
		lines.splice(at, 0, `${head}|${to.patch ? '' : ' _ |'.repeat(b)}${bar}|`)
		ln = at + 1
	}
	const out = lines.join('\n')
	return { text: out, ln, col: columnOf(lines[ln - 1], k, st, v.drum) }
}

// The note of `voice` sounding at the place's step in its bar, if any.
export function noteAt(text, song, place, voice) {
	let found = null
	editBar(text, song, place, voice, (bar) => {
		found = bar.notes?.find((nt) => place.st >= nt.st && place.st < nt.st + nt.len) ?? null
		return null
	})
	return found
}

// Room for a note at step `st`: what's sounding there is cut short (or goes,
// if it starts there), and the note's length stops at the next one.
function clear(bar, st, len, n) {
	if (st < bar.tie) bar.tie = st
	bar.notes = bar.notes.filter((nt) => nt.st !== st)
	for (const nt of bar.notes) if (nt.st < st && nt.st + nt.len > st) nt.len = st - nt.st
	const next = Math.min(n, ...bar.notes.filter((nt) => nt.st > st).map((nt) => nt.st))
	return Math.max(1, Math.min(len, next - st))
}

// Adds a note of written midi number `m`, `len` steps long, on `voice` at
// the place; `len` in the result is as long as it could be. `head` writes
// something else there instead (a chord).
export function addNote(text, song, place, voice, m, len, key, head) {
	const name = head ?? nameOf(text, m, key)
	if (!name) return null
	let fit = len
	const out = editBar(
		text,
		song,
		place,
		voice,
		(bar, n) => {
			fit = clear(bar, place.st, len, n)
			bar.notes.push({ st: place.st, len: fit, pre: '', head: name, marks: '' })
			bar.notes.sort((a, b) => a.st - b.st)
			return bar
		},
		place.st,
	)
	return out && { ...out, len: fit }
}

// Deletes the note of `voice` sounding at the place.
export function removeNote(text, song, place, voice) {
	let gone = null
	const out = editBar(
		text,
		song,
		place,
		voice,
		(bar) => {
			gone = bar.notes.find((nt) => place.st >= nt.st && place.st < nt.st + nt.len)
			if (!gone) return null
			bar.notes = bar.notes.filter((nt) => nt !== gone)
			return bar
		},
		place.st,
	)
	return out && { ...out, note: gone }
}

// Makes the note of `voice` starting at the place `len` steps long, as far
// as the next note or the end of the bar.
export function stretchNote(text, song, place, voice, len) {
	return editBar(
		text,
		song,
		place,
		voice,
		(bar, n) => {
			const nt = bar.notes.find((nt) => nt.st === place.st)
			if (!nt) return null
			const next = Math.min(n, ...bar.notes.filter((o) => o.st > nt.st).map((o) => o.st))
			const to = Math.max(1, Math.min(len, next - nt.st))
			if (to === nt.len) return null
			nt.len = to
			return bar
		},
		place.st,
	)
}

// Moves the note of `voice` starting at place `from` to place `to`, `by`
// semitones up (written; a chord moves whole), keeping its marks.
export function moveNote(text, song, from, to, voice, by, key) {
	const gone = removeNote(text, song, from, voice)
	if (!gone) return null
	const nt = gone.note
	const head = by ? transposeToken(nt.head, by, prefersFlats(key)) : nt.head
	return editBar(
		gone.text,
		compile(gone.text),
		to,
		voice,
		(bar, n) => {
			const fit = clear(bar, to.st, nt.len, n)
			bar.notes.push({ ...nt, st: to.st, len: fit, head })
			bar.notes.sort((a, b) => a.st - b.st)
			return bar
		},
		to.st,
	)
}

// Switches the drum hit of `voice` at the place on (`x`) or off.
export function setHit(text, song, place, voice, on) {
	return editBar(
		text,
		song,
		place,
		voice,
		(hits) => {
			if ((hits[place.st] !== '.') === on) return null
			hits[place.st] = on ? 'x' : '.'
			return hits
		},
		place.st,
	)
}
