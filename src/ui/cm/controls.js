// The live controls in the score, as text: the numbers you can drag, what a
// drag makes of one, and what the pointer is over. Every control writes text.
import { SETTINGS } from '../../score.js'
import { paint } from '../paint.js'
import { barAt } from '../link.js'
import { DRUM_STEPS, HINTS, chordNotes } from '../hints.js'

const NUMBER = '-?\\d+(?:\\.\\d+)?'
const HEAD = new RegExp(`^(${SETTINGS.join('|')})(\\s+)(${NUMBER})\\s*$`, 'i')
// Options that go below zero.
const SIGNED = new Set(['pan', 'trans', 'oct'])
// Settings that count whole things, from one.
const WHOLE = new Set(['beats', 'steps'])

// The numbers in `line` you can drag: a voice's or a pattern's options
// (vol=0.6, tempo=120) and the head's settings (tempo 100), each
// { start, end, name } in columns of the line.
export function numbersIn(line) {
	const hash = line.search(/(^|\s)#/)
	const body = hash < 0 ? line : line.slice(0, hash)
	if (/^\s*(voice|pattern)\s/i.test(body))
		return [...body.matchAll(new RegExp(`(\\w+)=(${NUMBER})(?=\\s|$)`, 'g'))].map((m) => ({
			start: m.index + m[1].length + 1,
			end: m.index + m[0].length,
			name: m[1].toLowerCase(),
		}))
	const m = HEAD.exec(body)
	if (!m) return []
	const start = m[1].length + m[2].length
	return [{ start, end: start + m[3].length, name: m[1].toLowerCase() }]
}

// Number `value` (as written) of option `name`, moved `by` steps of its last
// digit, written with as many decimals.
export function scrub(value, by, name) {
	const places = value.split('.')[1]?.length ?? 0
	const min = SIGNED.has(name) ? -Infinity : WHOLE.has(name) ? 1 : 0
	let to = Math.max(min, Number(value) + by * 10 ** -places).toFixed(places)
	if (/^-0(\.0*)?$/.test(to)) to = to.slice(1)
	return to
}

// What's at column `col` of `line`, for the pointer: an instrument
// { start, voice, inst }, or something with a few words on it { start, tip },
// or null. `names` are the song's voices, `drums` a Set of its drum voices.
export function hintAt(line, col, names, drums) {
	let start = 0
	let piece = null
	for (const p of paint(line, names)) {
		if (col < start + p[1].length) {
			piece = p
			break
		}
		start += p[1].length
	}
	if (!piece) return null
	const kind = piece[0]
	if (kind === 'inst') return { start, voice: /^\s*voice\s+(\S+)/i.exec(line)[1], inst: piece[1].toLowerCase() }
	const music = /^\s*(\w+)(@\d+)?\s*\|/.exec(line)
	if (music) {
		if (kind === 'chord') {
			const tip = chordNotes(piece[1])
			return tip && { start, tip }
		}
		if (!drums.has(music[1]) || (kind !== 'note' && kind !== 'rest')) return null
		const bar = barAt(line, line.slice(0, col).split('|').length - 2)
		return bar && { start: bar.start + bar.text.search(/\S|$/), tip: DRUM_STEPS }
	}
	const head = /\S*$/.exec(line.slice(0, col))[0]
	const name = /^\w+/.exec(head + /^\S*/.exec(line.slice(col))[0])?.[0].toLowerCase()
	return Object.hasOwn(HINTS, name) && kind !== 'name' ? { start: col - head.length, tip: HINTS[name] } : null
}

// A drum step flipped by a tap on its pad: a rest becomes a hit, anything
// else a rest.
export const flip = (step) => (step === '.' ? 'x' : '.')
