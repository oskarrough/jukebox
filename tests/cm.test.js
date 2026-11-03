import { describe, expect, test } from 'bun:test'
import { flip, hintAt, numbersIn, scrub } from '../src/ui/cm/controls.js'

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
		expect(hintAt('voice keys rhodes vol=0.4', 19, names, drums).tip).toMatch(/^Volume/)
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
