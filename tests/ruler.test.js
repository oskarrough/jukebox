import { describe, expect, test } from 'bun:test'
import { ruler, stepsOf } from '../src/ui/ruler.js'

const HEAD = 'beats 4\nsteps 4\nvoice gtr guitar\nvoice kick kick\npattern A\n'
// What the ruler marks for the bar with the caret at ^, as class@text.
const at = (text) => {
	const pos = text.indexOf('^')
	const clean = text.replace('^', '')
	const r = ruler(clean, pos)
	const line = clean.split('\n')[r?.ln - 1]
	return r && r.marks.map((m) => `${m.cls}@${line.slice(m.start, m.end)}`)
}

describe('steps', () => {
	test('a note, a chord and each of their holds are a step', () => {
		expect(stepsOf(' [Fmaj7]-- .. C#4!- ', false).map((s) => s.start)).toEqual([1, 8, 9, 11, 12, 14, 18])
		expect(stepsOf(' x. .x ', true)).toHaveLength(4)
	})
	test('a bar that repeats, holds or rests has none to count', () => {
		for (const bar of ['%', ' _ ', '=']) expect(stepsOf(bar, false)).toBeNull()
	})
})

describe('the beat ruler', () => {
	test('a full bar has a tick on each beat and nothing warm', () => {
		expect(at(HEAD + 'gtr | C4--- D4-^-- E4--- F4--- |')).toEqual(['tick@C4', 'tick@D4', 'tick@E4', 'tick@F4'])
	})
	test('a short bar warms its closing bar', () => {
		expect(at(HEAD + 'gtr | C4--- D4-^-- |')).toEqual(['tick@C4', 'tick@D4', 'short@|'])
	})
	test('a long bar warms the steps past the end and its closing bar', () => {
		expect(at(HEAD + 'kick | x... x... x... x... x^. |')).toEqual(['tick@x', 'tick@x', 'tick@x', 'tick@x', 'long@x', 'long@.', 'long@|'])
	})
	test('a bar still being written has no end to warm', () => {
		expect(at(HEAD + 'gtr | C4--- D4--^- ')).toEqual(['tick@C4', 'tick@D4'])
		expect(at(HEAD + 'gtr | C4--- D4---^ ')).toEqual(['tick@C4', 'tick@D4'])
	})
	test('the bar is the one the caret is in', () => {
		expect(at(HEAD + 'gtr | C4--- D4--- E4--- F4--- | ^G4--- |')).toEqual(['tick@G4', 'short@|'])
	})
	test('a pattern keeps its own beats, and one built on it the same', () => {
		const text = 'beats 4\nsteps 4\nvoice gtr guitar\npattern A beats=3\npattern B from A\n'
		expect(at(text + 'gtr | C4--- D4--- E4^--- |')).toEqual(['tick@C4', 'tick@D4', 'tick@E4'])
		expect(at(text + 'gtr | C4--- D4--- E4--- F4^--- |')).toEqual([
			'tick@C4',
			'tick@D4',
			'tick@E4',
			'long@F4',
			'long@-',
			'long@-',
			'long@-',
			'long@|',
		])
	})
	test('nothing shows outside a bar, in a comment or in a bar without steps', () => {
		expect(at(HEAD + '^gtr | C4--- |')).toBeNull()
		expect(at(HEAD + 'title ^Spree')).toBeNull()
		expect(at(HEAD + 'gtr | C4--- | # a | b ^')).toBeNull()
		expect(at(HEAD + 'gtr | C4--- | %^ |')).toBeNull()
	})
	test('drum steps count by the character', () => {
		expect(at(HEAD + 'kick | x...^ x... x... x... |')).toEqual(['tick@x', 'tick@x', 'tick@x', 'tick@x'])
	})
})
