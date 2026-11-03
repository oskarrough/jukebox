import { describe, expect, test } from 'bun:test'
import { drift, flip, hintAt, numbersIn, scrub } from '../src/ui/cm/controls.js'
import { OPTIONS } from '../src/score.js'
import { START } from '../src/ui/hints.js'
import { suggest } from '../src/ui/complete.js'
import { inherited, repeats } from '../src/ui/cm/meaning.js'

describe('numbers you can drag', () => {
	test("a voice's options", () => {
		const line = 'voice keys   rhodes  vol=0.4  pan=-0.35 gate=0.9 part=top'
		expect(numbersIn(line).map((n) => [n.name, line.slice(n.start, n.end)])).toEqual([
			['vol', '0.4'],
			['pan', '-0.35'],
			['gate', '0.9'],
		])
	})
	test("a pattern's settings and the head's", () => {
		const line = 'pattern B from A tempo=120 swing=0.1'
		expect(numbersIn(line).map((n) => line.slice(n.start, n.end))).toEqual(['120', '0.1'])
		expect(numbersIn('tempo    106')).toEqual([{ start: 9, end: 12, name: 'tempo' }])
	})
	test('not in comments, music or words', () => {
		expect(numbersIn('voice saz saz # vol=0.5')).toEqual([])
		expect(numbersIn('saz | D4- D4 |')).toEqual([])
		expect(numbersIn('title    Tempo 30')).toEqual([])
		expect(numbersIn('  tempo 100')).toEqual([])
	})
})

describe('a drag moves a number by its last digit', () => {
	test('keeping its decimals', () => {
		expect(scrub('0.6', 2, 'vol')).toBe('0.8')
		expect(scrub('0.85', -5, 'vol')).toBe('0.80')
		expect(scrub('106', 4, 'tempo')).toBe('110')
	})
	test('no lower than it can go', () => {
		expect(scrub('0.2', -5, 'vol')).toBe('0.0')
		expect(scrub('0.2', -5, 'pan')).toBe('-0.3')
		expect(scrub('-0.1', 1, 'pan')).toBe('0.0')
		expect(scrub('2', -5, 'beats')).toBe('1')
	})
})

describe('what the pointer is over', () => {
	const names = ['kick', 'keys']
	const drums = new Set(['kick'])
	test('an instrument, to hear', () => {
		expect(hintAt('voice keys rhodes vol=0.4', 13, names, drums)).toEqual({ start: 11, voice: 'keys', inst: 'rhodes' })
	})
	test('an option, a chord, a drum bar', () => {
		expect(hintAt('voice keys rhodes vol=0.4', 19, names, drums).tip).toMatch(/loud/)
		expect(hintAt('chords | Dm9 |', 10, names, drums).tip).toBe('D3 F3 A3 C4 E4')
		expect(hintAt('kick | x... x... |', 9, names, drums)).toEqual({ start: 7, tip: expect.stringMatching(/hit/) })
	})
	test('nothing on a name or a melody', () => {
		expect(hintAt('voice keys rhodes', 7, names, drums)).toBeNull()
		expect(hintAt('keys | C4- D4 |', 8, names, drums)).toBeNull()
	})
})

test('a pad flips a rest to a hit and a hit to a rest', () => {
	expect(['.', 'o', 'x', 'X'].map(flip)).toEqual(['x', '.', '.', '.'])
})

test("a voice's name says it mutes, and plays its instrument", () => {
	const chips = { insts: { saz: 'saz' }, muted: new Set(['keys']) }
	expect(hintAt('voice saz saz vol=0.8', 7, ['saz'], new Set(), chips)).toEqual({
		start: 6,
		voice: 'saz',
		inst: 'saz',
		tip: 'Mute saz (⌥-click or hold to solo)',
	})
	expect(hintAt('saz | D4 |', 1, ['saz'], new Set(), chips).inst).toBe('saz')
	expect(hintAt('keys | C4 |', 1, ['keys'], new Set(), { ...chips, insts: { keys: 'rhodes' } }).tip).toMatch(/^Unmute keys/)
})

describe('the shorthand, said plainly', () => {
	const song = [
		'pattern A',
		'chords | C | F |',
		'kick | x... |',
		'keys | C4 |',
		'',
		'pattern A2 from A',
		'kick | x.x. |',
		'',
		'loop A A2',
	].join('\n')
	test('a pattern built on another shows the lines it does not write', () => {
		const r = inherited(song)
		expect(r.map((b) => [b.name, b.lines.map((l) => l.voice)])).toEqual([['A2', ['chords', 'keys']]])
		expect(song.slice(r[0].at - 13, r[0].at)).toBe('kick | x.x. |')
	})
	test('a muted voice or a chain', () => {
		const t = song.replace('loop', 'mute keys\n\npattern A3 from A2\n\nloop')
		expect(inherited(t).map((b) => [b.name, b.lines.map((l) => l.voice)])).toEqual([
			['A2', ['chords']],
			['A3', ['chords', 'kick']],
		])
	})
	test('a % is the bar before it, a _ is silence', () => {
		const t = 'kick | x... | % | _ | %\nkeys | C4 D4 | %'
		expect(repeats(t).map((r) => [t.slice(r.from, r.to), r.silent, r.bar, r.voice])).toEqual([
			['%', false, 'x...', 'kick'],
			['_', true, 'x...', 'kick'],
			['%', true, 'x...', 'kick'],
			['%', false, 'C4 D4', 'keys'],
		])
	})
	test('a bar carries on to the next line', () => {
		const t = 'kick | x... |\n| %'
		expect(repeats(t).map((r) => r.bar)).toEqual(['x...'])
	})
})

describe('what an option starts at', () => {
	test('every option goes in with a value to drag', () => {
		for (const o of OPTIONS) if (o !== 'part') expect(START[o]).toMatch(/^-?[\d.]+$|^[A-G]/)
		expect(START.echo).toBe('3')
	})
	test('suggestions write them in', () => {
		const s = suggest('voice keys rhodes ', 18, { letter: 'C', acc: '', pc: 0 }, true)
		expect(s.items.find((i) => i.word === 'echo').insert).toBe('echo=3')
		expect(s.items.find((i) => i.word === 'pan').insert).toBe('pan=0.0')
	})
	test('up drags a number up, like a knob', () => {
		expect(drift(0, -12)).toBe(2)
		expect(drift(12, 0)).toBe(2)
		expect(drift(6, 6)).toBe(0)
	})
})
