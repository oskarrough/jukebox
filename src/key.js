// Song key: parse, infer, transpose the score text, and drop bricks into it.
// Bricks and the new-song starter are written in C; they move with the song.
import { CHORD_RE, compile, noteToMidi, parse, parseKey } from './score.js'

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const MAJOR_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const MINOR_NAMES = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'Abm', 'Am', 'Bbm', 'Bm']
const NOTE = '[A-Ga-g](?:##|bb|#|b|q)?[0-8]'
const T_NOTE = new RegExp(`^(~?)(\\[([^\\]]+)\\]|${NOTE}(?:\\+${NOTE})*)([!?]*)(-*)([!?]*)$`)
// The steps of a key's scale, in semitones above its keynote.
const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const MINOR = [0, 2, 3, 5, 7, 8, 10]
export const scaleSteps = (key) => (key?.minor ? MINOR : MAJOR)
// The pitch classes of `key`'s scale (C major without one), as a Set.
export const scaleOf = (key) => new Set(scaleSteps(key).map((d) => (d + (key?.pc ?? 0)) % 12))
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const ACC = { '': 0, '#': 1, '##': 2, b: -1, bb: -2 }

export const KEY_C = parseKey('C')
export const KEY_ROOTS = MAJOR_NAMES

export function prefersFlats(key) {
	if (!key) return false
	if (key.acc === 'b') return true
	if (key.acc === '#') return false
	if (key.letter === 'F') return true
	return !!(key.minor && (key.letter === 'C' || key.letter === 'D' || key.letter === 'G'))
}

function keyFromPc(pc, minor) {
	return parseKey((minor ? MINOR_NAMES : MAJOR_NAMES)[((pc % 12) + 12) % 12])
}

function pcOf(letter, acc) {
	return (PC[letter.toUpperCase()] + (ACC[acc || ''] || 0) + 12) % 12
}

export function spellPc(pc, flats) {
	return (flats ? FLAT : SHARP)[((pc % 12) + 12) % 12]
}

// Midi number `midi` as the score writes it, in sharps or flats.
export function fromMidi(midi, flats) {
	const frac = ((midi % 1) + 1) % 1
	const quarter = frac > 0.25 && frac < 0.75
	const base = quarter ? Math.round(midi + 0.5) : Math.round(midi)
	const pc = ((base % 12) + 12) % 12
	const oct = Math.floor(base / 12) - 1
	const name = (flats ? FLAT : SHARP)[pc]
	if (quarter && name.length === 1) return `${name}q${oct}`
	return name + oct
}

export function transposeNoteName(s, semis, flats) {
	const midi = noteToMidi(s)
	if (midi == null) return s
	return fromMidi(midi + semis, flats)
}

export function transposeChordBody(sym, semis, flats) {
	const m = CHORD_RE.exec(sym)
	if (!m) return sym
	let out = spellPc(pcOf(m[1], m[2]) + semis, flats) + m[3]
	if (m[4]) out += '/' + spellPc(pcOf(m[4], m[5]) + semis, flats)
	return out
}

export function transposeToken(tok, semis, flats) {
	const m = T_NOTE.exec(tok)
	if (!m) return tok
	const next = m[2].startsWith('[')
		? `[${transposeChordBody(m[3], semis, flats)}]`
		: m[2]
				.split('+')
				.map((n) => transposeNoteName(n, semis, flats))
				.join('+')
	return m[1] + next + m[4] + m[5] + m[6]
}

export function transposeScore(text, semis, key) {
	if (!semis) return text
	const flats = prefersFlats(key)
	return String(text)
		.split('\n')
		.map((line) => {
			const music = /^(([A-Za-z_]\w*)(?:@\d+)?\s*\|)(.*)$/.exec(line)
			if (music) {
				const row = music[2] === 'chords'
				const rest = music[3]
					.split(/(\s+|\|)/)
					.map((tok) =>
						tok === '|' || /^\s*$/.test(tok)
							? tok
							: row
								? /^[A-G]/.test(tok)
									? transposeChordBody(tok, semis, flats)
									: tok
								: transposeToken(tok, semis, flats),
					)
					.join('')
				return music[1] + rest
			}
			return line.replace(/\bcenter=([A-Ga-g](?:##|bb|#|b|q)?[0-8])/g, (_, n) => `center=${transposeNoteName(n, semis, flats)}`)
		})
		.join('\n')
}

function upsertKeyLine(text, key) {
	const line = `key      ${key.name}`
	if (/^[ \t]*key\b/im.test(text)) return text.replace(/^[ \t]*key\b.*$/im, line)
	const lines = text.split('\n')
	let at = 0
	for (let i = 0; i < lines.length; i++) {
		if (/^(title|about|composer|by|street|at)\b/i.test(lines[i])) at = i + 1
		else if (/^(tempo|beats|steps|reverb|voice|pattern)\b/i.test(lines[i])) {
			at = i
			break
		}
	}
	lines.splice(at, 0, line)
	return lines.join('\n')
}

export function inferKey(song) {
	const counts = new Array(12).fill(0)
	for (const tl of [song?.intro, song?.loop]) {
		if (!tl?.events) continue
		for (const e of tl.events) {
			if (!e.m) continue
			for (const m of e.m) counts[((Math.round(m) % 12) + 12) % 12]++
		}
	}
	let pc = 0
	for (let i = 1; i < 12; i++) if (counts[i] > counts[pc]) pc = i
	if (!counts[pc]) return KEY_C
	return keyFromPc(pc, counts[(pc + 3) % 12] > counts[(pc + 4) % 12])
}

export function keyOf(text, parsed = parse(text).song) {
	if (parsed?.key) return parsed.key
	const song = compile(text)
	return song.key || inferKey(song)
}

export function setSongKey(text, next) {
	const key = typeof next === 'string' ? parseKey(next) : next
	if (!key) return text
	const from = keyOf(text)
	const semis = (key.pc - from.pc + 12) % 12
	return upsertKeyLine(transposeScore(text, semis, key), key)
}

// Bricks are written in C minor. In a major key their minor third, sixth and
// seventh (Eb, Ab, Bb) and minor chords go major; minor keys keep them.
const MINOR_STEPS = [3, 8, 10]

export function transposeBrick(brick, key) {
	const semis = (key?.pc || 0) - (KEY_C.pc || 0)
	const major = key && !key.minor
	if (!brick.notes || (!semis && !major)) return brick
	const flats = prefersFlats(key)
	return {
		...brick,
		notes: brick.notes.map((n) => {
			if (n[0] === '[') {
				const sym = n.slice(1, -1)
				return `[${transposeChordBody(major && /^[A-G][#b]?m$/.test(sym) ? sym.slice(0, -1) : sym, semis, flats)}]`
			}
			if (!T_NOTE.test(n) || !/[A-Ga-g]/.test(n)) return n
			const midi = noteToMidi(n)
			const up = major && midi != null && MINOR_STEPS.includes(((midi % 12) + 12) % 12) ? 1 : 0
			return transposeNoteName(n, semis + up, flats)
		}),
	}
}

// A new song: a blank canvas in C (or the key you give it) with only its head.
// Tagged with `tag` when you're looking at one.
export function starter(key = 'C', { title = 'New song', tag = '' } = {}) {
	const k = typeof key === 'string' ? parseKey(key) : key
	const head = [`title    ${title}`]
	if (tag) head.push(`tags     ${tag}`)
	head.push(`key      ${k?.name ?? 'C'}`)
	return `${head.join('\n')}\ntempo    100\nbeats    4\nsteps    4\n`
}

// A name for a new song: Untitled, then Untitled 2, 3 … until you name it.
export function newTitle(taken = []) {
	const used = new Set(taken.map((t) => t.toLowerCase()))
	let title = 'Untitled'
	for (let n = 2; used.has(title.toLowerCase()); n++) title = `Untitled ${n}`
	return title
}
