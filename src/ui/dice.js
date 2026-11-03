// A die per voice, after Dance eJay: a roll writes a voice's bars in a
// pattern again as a variation of what's there, in the key and on the chord
// row. Drums keep their job (kicks on the beat, snares on the backbeat, hats
// busy) and about as many hits; a voice on the chord row gets a new rhythm;
// a voice with notes new notes near the chord's, in its register and nearly
// its rhythm. Some of what was there stays, so rolls sound related. Each bar
// goes through editBar, the way drawing on the tape does; a % stays a %.
import { compile, LOW, noteToMidi, parseChord } from '../score.js'
import { fromMidi, keyOf, prefersFlats, scaleOf } from '../key.js'
import { barAt } from './link.js'
import { inherited } from './cm/meaning.js'
import { blockOf, editBar, nameOf } from './draw.js'

// The same seed rolls the same way.
export function dice(seed) {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

// One of `items`, likelier the more it weighs.
function pick(rng, items, weigh) {
	const ws = items.map(weigh)
	let r = rng() * ws.reduce((s, w) => s + w, 0)
	for (let i = 0; i < items.length; i++) if ((r -= ws[i]) <= 0) return items[i]
	return items.at(-1)
}

// What a drum is for.
const ROLES = {
	low: ['kick', 'tumba', 'dum', 'bodhran', 'tomlo'],
	back: ['snare', 'clap', 'tek'],
	busy: ['hat', 'shaker', 'tamb', 'ride', 'guiro', 'riq'],
	open: ['ohat'],
	once: ['crash', 'gong', 'thunder', 'surf'],
}
const roleOf = (inst) => Object.keys(ROLES).find((r) => ROLES[r].includes(inst)) ?? 'perc'

// How much a hit of `role` belongs on step `i` of a bar of `beats` × `steps`.
function weight(role, i, beats, steps) {
	const beat = Math.floor(i / steps)
	const sub = i % steps
	const on = sub === 0
	const off = steps % 2 === 0 && sub === steps / 2
	if (role === 'low') return on ? (beat === 0 ? 1 : 0.8) : off ? 0.3 : 0.08
	if (role === 'back') return on && beat % 2 === 1 ? 1 : on ? 0.1 : sub === steps - 1 ? 0.3 : 0.12
	if (role === 'busy') return on ? 0.75 : off ? 0.85 : 0.45
	if (role === 'open') return off ? 1 : 0.08
	if (role === 'once') return i === 0 ? 1 : 0.02
	if (role === 'chord') return on ? (beat === 0 ? 1 : 0.7) : off ? 0.6 : 0.3
	return on ? 0.35 : off ? 0.5 : 0.45
}
// How many hits a bar of `role` has when it has none.
const DENSITY = { low: 0.25, back: 0.125, busy: 0.5, open: 0.25, once: 0.0625, chord: 0.25, perc: 0.25 }

// New places for the hits at `on` (step numbers) in a bar of `n`: some go,
// as many come where `role` wants them, give or take one. The downbeat of a
// kick and the backbeat of a snare mostly stay.
function moveHits(rng, on, n, role, beats, steps) {
	const w = (i) => weight(role, i, beats, steps)
	const sharp = role === 'busy' || role === 'perc' ? 1 : 2
	const hits = new Set(on)
	if (!hits.size) {
		const want = Math.max(1, Math.round(n * DENSITY[role]))
		const free = [...Array(n).keys()]
		for (let k = 0; k < want; k++) hits.add(free.splice(free.indexOf(pick(rng, free, (i) => w(i) ** sharp)), 1)[0])
		return [...hits].sort((a, b) => a - b)
	}
	const swaps = Math.max(1, Math.round(hits.size * (0.15 + rng() * 0.2)))
	const gone = new Set()
	for (let k = 0; k < swaps; k++) {
		// A hit goes, unless every hit is where it belongs: then one comes, once.
		const left = [...hits].filter((i) => on.includes(i))
		const out = left.length > 1 ? pick(rng, left, (i) => Math.max(0.03, 1.05 - w(i)) ** sharp) : null
		if (out != null && (w(out) < 0.6 || hits.size > on.length || rng() < 0.4)) {
			hits.delete(out)
			gone.add(out)
		}
		const free = [...Array(n).keys()].filter((i) => !hits.has(i) && !gone.has(i))
		if (free.length && (hits.size <= on.length || rng() < 0.2)) hits.add(pick(rng, free, (i) => w(i) ** sharp))
	}
	return [...hits].sort((a, b) => a - b)
}

// The hit a new step gets: the bar's own, an accent on a beat where it has them.
function hitChar(rng, chars, i, steps) {
	if (!chars.length) return 'x'
	if (chars.includes('X') && i % steps === 0 && rng() < 0.6) return 'X'
	const plain = chars.filter((c) => c !== 'X')
	return (plain.length ? plain : chars)[Math.floor(rng() * (plain.length || chars.length))]
}

// A drum bar's steps rolled.
function rollDrums(rng, old, role, beats, steps) {
	const n = old.length
	const on = old.flatMap((c, i) => (c === '.' ? [] : [i]))
	const chars = on.map((i) => old[i])
	const next = moveHits(rng, on, n, role, beats, steps)
	return old.map((c, i) => (!next.includes(i) ? '.' : c !== '.' ? c : hitChar(rng, chars, i, steps)))
}

// A bar on the chord row's steps rolled: new hits, each held as long as the
// bar held its own.
function rollSteps(rng, old, beats, steps) {
	const n = old.length
	const on = old.flatMap((c, i) => (/[xXo]/.test(c) ? [i] : []))
	const chars = on.map((i) => old[i])
	let held = 0
	let gaps = 0
	on.forEach((i, j) => {
		let len = 1
		while (old[i + len] === '-') len++
		held += len
		gaps += (on[j + 1] ?? n) - i
	})
	const fill = gaps ? held / gaps : 0.5
	const next = moveHits(rng, on, n, 'chord', beats, steps)
	const out = Array(n).fill('.')
	next.forEach((i, j) => {
		const len = Math.max(1, Math.round(((next[j + 1] ?? n) - i) * fill))
		out[i] = old[i] !== '.' && old[i] !== '-' ? old[i] : hitChar(rng, chars, i, steps)
		for (let k = 1; k < len; k++) out[i + k] = '-'
	})
	return out
}

const single = (head) => /^[A-Ga-g](?:##|bb|#|b|q)?[0-8]$/.test(head)

// A bar of notes almost in its rhythm: one note split, two joined, one
// added in a rest or one dropped, now and then.
function nudgeRhythm(rng, bar, n, steps) {
	const notes = bar.notes
	if (rng() < 0.45) return
	const ends = (nt) => nt.st + nt.len
	const ops = []
	const long = notes.filter((nt) => nt.len >= 2 && single(nt.head))
	if (long.length) ops.push('split')
	const pairs = notes.filter((nt, i) => notes[i + 1] && ends(nt) === notes[i + 1].st)
	if (pairs.length && notes.length > 2) ops.push('join')
	const owned = Array(n).fill(false)
	for (let k = 0; k < bar.tie; k++) owned[k] = true
	for (const nt of notes) for (let k = nt.st; k < ends(nt); k++) owned[k] = true
	const free = [...Array(n).keys()].filter((k) => !owned[k] && (k % steps === 0 || k % steps === steps / 2))
	if (free.length && notes.length) ops.push('add')
	if (notes.length > 3) ops.push('drop')
	if (!ops.length) return
	const op = ops[Math.floor(rng() * ops.length)]
	if (op === 'split') {
		const nt = pick(rng, long, (x) => x.len)
		const at = Math.max(1, Math.round(nt.len / 2))
		notes.splice(notes.indexOf(nt) + 1, 0, { st: nt.st + at, len: nt.len - at, pre: '', head: nt.head, marks: '', fresh: true })
		nt.len = at
	} else if (op === 'join') {
		const nt = pairs[Math.floor(rng() * pairs.length)]
		const next = notes[notes.indexOf(nt) + 1]
		nt.len += next.len
		notes.splice(notes.indexOf(next), 1)
	} else if (op === 'add') {
		const st = free[Math.floor(rng() * free.length)]
		let len = 1
		while (st + len < n && !owned[st + len] && len < steps) len++
		const near = notes.reduce((a, b) => (Math.abs(b.st - st) < Math.abs(a.st - st) ? b : a))
		notes.push({ st, len, pre: '', head: near.head, marks: '', fresh: true })
		notes.sort((a, b) => a.st - b.st)
	} else {
		const nt = notes[1 + Math.floor(rng() * (notes.length - 1))]
		notes.splice(notes.indexOf(nt), 1)
	}
}

// The pitch classes of the chord sounding at a step, its root first.
function chordPcs(sym, key) {
	const c = sym && parseChord(sym)
	if (!c) return key.minor ? [key.pc, (key.pc + 3) % 12, (key.pc + 7) % 12] : [key.pc, (key.pc + 4) % 12, (key.pc + 7) % 12]
	return [c.bass ?? c.root, ...c.ivs.map((iv) => (c.root + iv) % 12)]
}

// A note for a step: in the key or the chord, in the voice's register, near
// the note before; a chord tone on the beat, a bass's root to start a bar.
function choose(rng, { lo, hi, prev, chord, scale, strong, first, bass, last }) {
	const allowed = new Set([...scale, ...chord])
	const tones = new Set(chord)
	let best = null
	let top = -Infinity
	for (let m = Math.ceil(lo); m <= hi; m++) {
		const pc = m % 12
		if (!allowed.has(pc)) continue
		let s = tones.has(pc) ? (strong || last ? 3 : 1) : 0
		if (bass && pc === chord[0]) s += first || last ? 5 : 0.5
		if (prev != null) {
			const leap = Math.abs(m - prev)
			s -= leap * (bass ? 0.15 : 0.3) + (leap > 7 ? 1.5 : 0) + (leap === 0 ? (bass ? 0.8 : 2.2) : 0)
		}
		s += rng() * 1.8
		if (s > top) [top, best] = [s, m]
	}
	return best
}

// Rolls `voice`'s bars in pattern `pattern` of `text` with `seed`: the bars
// it writes there, as its own line if it only takes one from the pattern
// it's built on. Returns { text, ln, col }, the caret on the first bar
// rolled, or null where there's nothing to roll.
export function roll(text, pattern, voice, seed) {
	let song = compile(text, pattern)
	let sec = song.loop.sections[0]
	const v = song.voices.find((w) => w.name === voice)
	if (!sec || sec.name !== pattern || !v || !sec.where?.[voice]?.length) return null
	const own = () => {
		const [lo, hi] = blockOf(text.split('\n'), sec.ln)
		return sec.where[voice].map((w, b) => ({ ...w, b })).filter((w) => w.k >= 0 && w.ln >= lo && w.ln <= hi)
	}
	if (!own().length) {
		const block = inherited(text).find((b) => b.name === pattern)
		const line = block?.lines.find((l) => l.voice === voice)
		if (!line) return null
		text = text.slice(0, block.at) + '\n' + line.text + text.slice(block.at)
		song = compile(text, pattern)
		sec = song.loop.sections[0]
	}
	const rng = dice(seed)
	const key = keyOf(text)
	const scale = scaleOf(key)
	const flats = prefersFlats(key)
	const n = sec.beats * sec.steps
	const role = roleOf(v.inst)
	const lines = text.split('\n')
	const bars = own()
	const plainBar = (w) => !/^\s*[%_=]\s*$/.test(barAt(lines[w.ln - 1], w.k)?.text ?? '%')
	const rolled = bars.filter(plainBar)
	// A drum groove that repeats gets a fill at its end, now and then.
	const tail = bars.at(-1)
	if (v.drum && role !== 'once' && rolled.length && bars.length >= 4 && tail && !plainBar(tail) && rng() < 0.35) rolled.push(tail)
	if (!rolled.length) return null

	// The register to write notes in, from the notes there now.
	const midis = []
	for (const w of bars)
		for (const m of (barAt(lines[w.ln - 1], w.k)?.text ?? '').matchAll(/(?<![\w#[])([A-Ga-g](?:##|bb|#|b|q)?[0-8])(?![\w#])/g))
			midis.push(noteToMidi(m[1]))
	let lo = Math.min(...midis)
	let hi = Math.max(...midis)
	if (hi - lo < 7) [lo, hi] = [Math.floor((lo + hi) / 2) - 4, Math.ceil((lo + hi) / 2) + 4]
	const bass = LOW.has(v.inst) || hi < 52
	const chordAt = (step) => sec.chords.find((c) => step >= c.step && step < c.step + c.len)?.sym ?? sec.chords.at(-1)?.sym ?? null

	let prev = null
	let first = null
	for (const w of rolled) {
		const change = (bar) => {
			if (Array.isArray(bar))
				return v.drum
					? rollDrums(rng, bar, w === tail && rolled.length > 1 ? 'busy' : role, sec.beats, sec.steps)
					: rollSteps(rng, bar, sec.beats, sec.steps)
			nudgeRhythm(rng, bar, n, sec.steps)
			const lastBar = w === rolled.at(-1)
			bar.notes.forEach((nt, i) => {
				const was = single(nt.head) ? noteToMidi(nt.head) : null
				if (was == null) return
				const chord = chordPcs(chordAt(w.b * n + nt.st), key)
				const fit = scale.has(Math.round(was) % 12) || chord.includes(Math.round(was) % 12)
				if (!nt.fresh && fit && rng() < 0.3) return void (prev = was)
				const strong = nt.st % sec.steps === 0 || nt.len >= sec.steps
				const m = choose(rng, { lo, hi, prev, chord, scale, strong, first: i === 0, bass, last: lastBar && i === bar.notes.length - 1 })
				if (m == null) return
				prev = m
				nt.head = nameOf(text, m, key) ?? fromMidi(m, flats)
				if (nt.pre === '~' && i === 0 && !bar.tie) nt.pre = ''
				delete nt.fresh
			})
			for (const nt of bar.notes) delete nt.fresh
			return bar
		}
		const out = editBar(text, song, { tl: 'loop', i: 0, b: w.b, st: 0 }, voice, change, 0, true)
		if (!out) continue
		text = out.text
		first ??= out
	}
	return first && { text, ln: first.ln, col: first.col }
}
