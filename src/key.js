// Song key: parse, infer, transpose the score text, and drop bricks into it.
// Bricks and the new-song starter are written in C; they move with the song.
import { compile, noteToMidi, parse, parseKey } from './score.js'

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const MAJOR_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const MINOR_NAMES = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'Abm', 'Am', 'Bbm', 'Bm']
const NOTE = '[A-Ga-g](?:##|bb|#|b|q)?[0-8]'
const T_NOTE = new RegExp(`^(~?)(\\[([^\\]]+)\\]|${NOTE}(?:\\+${NOTE})*)([!?]*)(-*)([!?]*)$`)
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

function spellPc(pc, flats) {
	return (flats ? FLAT : SHARP)[((pc % 12) + 12) % 12]
}

function fromMidi(midi, flats) {
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
	const m = /^([A-G])(#|b)?([^/]*)(?:\/([A-G])(#|b)?)?$/.exec(sym)
	if (!m) return sym
	let out = spellPc(pcOf(m[1], m[2]) + semis, flats) + m[3]
	if (m[4]) out += '/' + spellPc(pcOf(m[4], m[5]) + semis, flats)
	return out
}

function transposeToken(tok, semis, flats) {
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
			const music = /^([A-Za-z_]\w*\s*\|)(.*)$/.exec(line)
			if (music) {
				const rest = music[2]
					.split(/(\s+|\|)/)
					.map((tok) => (tok === '|' || /^\s*$/.test(tok) ? tok : transposeToken(tok, semis, flats)))
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

export function transposeBrick(brick, key) {
	const semis = (key?.pc || 0) - (KEY_C.pc || 0)
	if (!brick.notes || !semis) return brick
	const flats = prefersFlats(key)
	return {
		...brick,
		notes: brick.notes.map((n) => {
			if (n[0] === '[') return `[${transposeChordBody(n.slice(1, -1), semis, flats)}]`
			if (T_NOTE.test(n) && /[A-Ga-g]/.test(n)) return transposeNoteName(n, semis, flats)
			return n
		}),
	}
}

export const STARTER = `title    New song
about    What it sounds like, and where.
key      C
tempo    100
beats    4
steps    4
reverb   0.3

voice lead  marimba  vol=0.8
voice pad   strings  vol=0.35 center=E4
voice bass  upright  vol=0.8
voice kick  kick     vol=0.7
voice hat   hat      vol=0.35

pattern A
lead | C5- E5- G5- E5- C5- E5- G5- B5- | A4- C5- E5- C5- A4--- G4--- |
pad  | [C]--------------- | [Am]--------------- |
bass | C2--- . C2 G2- C2--- G2--- | A1--- . A1 E2- A1--- E2--- |
kick | x... .... x... .... | % |
hat  | ..x. ..x. ..x. ..x. | % |

loop A
`

export function starter(key) {
	const k = typeof key === 'string' ? parseKey(key) : key
	if (!k || k.name === 'C') return STARTER
	return setSongKey(STARTER, k)
}
