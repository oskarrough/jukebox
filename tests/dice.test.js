import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { compile, parseChord } from '../src/score.js'
import { keyOf, scaleOf, starter } from '../src/key.js'
import { BRICKS, addBrick } from '../src/bricks.js'
import { roll } from '../src/ui/dice.js'

const song = (name) => readFileSync(`music/${name}.song`, 'utf8')
const HERMANN = song('hermannstrasse-um-drei')
// A song from bricks: kick, hats, snare, bells on a chord row.
const BRICKED = ['kick', 'hats', 'snare', 'bells'].reduce(
	(t, id) =>
		addBrick(
			t,
			BRICKS.find((b) => b.id === id),
		).text ??
		addBrick(
			t,
			BRICKS.find((b) => b.id === id),
		),
	starter('Am'),
)
const linesOf = (text, voice) => text.split('\n').filter((l) => new RegExp(`^${voice}\\s*\\|`).test(l))
// The step of each hit in a drum line's bars.
const hits = (line) =>
	line
		.split('|')
		.slice(1, -1)
		.flatMap((bar) => [...bar.replace(/\s+/g, '')].flatMap((c, i) => (/[xXo]/.test(c) ? [i] : [])))

describe('rolling a voice', () => {
	test('the same seed rolls the same, another seed another way', () => {
		expect(roll(HERMANN, 'A', 'bass', 7).text).toBe(roll(HERMANN, 'A', 'bass', 7).text)
		const takes = new Set([1, 2, 3, 4, 5].map((s) => roll(HERMANN, 'A', 'bass', s).text))
		expect(takes.size).toBeGreaterThan(3)
	})

	test('every roll still compiles, bars as long as before', () => {
		for (const [text, pattern, voices] of [
			[HERMANN, 'A', ['stab', 'bass', 'kick', 'hat', 'rim']],
			[HERMANN, 'B', ['keys', 'bass', 'ohat']],
			[HERMANN, 'A2', ['shake', 'keys']],
			[BRICKED, 'A', ['kick', 'hat', 'snare', 'bell']],
		])
			for (const v of voices)
				for (let seed = 1; seed <= 20; seed++) {
					const out = roll(text, pattern, v, seed)
					expect(out).not.toBeNull()
					expect(compile(out.text).errors).toEqual([])
					expect(out.text).not.toBe(text)
				}
	})

	test('notes stay in the key or the chord under them', () => {
		const key = keyOf(HERMANN)
		const scale = scaleOf(key)
		for (let seed = 1; seed <= 30; seed++)
			for (const [p, v] of [
				['B', 'keys'],
				['A', 'bass'],
			]) {
				const out = roll(HERMANN, p, v, seed).text
				const sec = compile(out, p).loop.sections[0]
				const vi = compile(out).voices.findIndex((x) => x.name === v)
				for (const e of compile(out, p).loop.events.filter((e) => e.v === vi && e.s === 0)) {
					const step = e.b * 16 + e.st
					const sym = sec.chords.find((c) => step >= c.step && step < c.step + c.len)?.sym
					const c = parseChord(sym)
					const tones = new Set([c.root, ...c.ivs.map((iv) => (c.root + iv) % 12)])
					for (const m of e.m) expect(scale.has(m % 12) || tones.has(m % 12)).toBe(true)
				}
			}
	})

	test('notes stay in the register', () => {
		for (let seed = 1; seed <= 30; seed++) {
			const vi = compile(HERMANN).voices.findIndex((x) => x.name === 'bass')
			const ms = compile(roll(HERMANN, 'A', 'bass', seed).text, 'A')
				.loop.events.filter((e) => e.v === vi)
				.flatMap((e) => e.m)
			expect(Math.min(...ms)).toBeGreaterThanOrEqual(33)
			expect(Math.max(...ms)).toBeLessThanOrEqual(45)
		}
	})

	test('drums keep their job and about as many hits', () => {
		let kickOn = 0
		let kicks = 0
		let snareBack = 0
		let snares = 0
		for (let seed = 1; seed <= 40; seed++) {
			const k = hits(linesOf(roll(BRICKED, 'A', 'kick', seed).text, 'kick')[0])
			expect(k.length).toBeGreaterThanOrEqual(3)
			expect(k.length).toBeLessThanOrEqual(5)
			kicks += k.length
			kickOn += k.filter((i) => i % 4 === 0).length
			const s = hits(linesOf(roll(BRICKED, 'A', 'snare', seed).text, 'snare')[0])
			snares += s.length
			snareBack += s.filter((i) => i === 4 || i === 12).length
		}
		expect(kickOn / kicks).toBeGreaterThan(0.6)
		expect(snareBack / snares).toBeGreaterThan(0.5)
	})

	test('a groove that repeats keeps its %', () => {
		const line = linesOf(roll(HERMANN, 'A', 'hat', 3).text, 'hat')[0]
		expect(
			line
				.split('|')
				.slice(2, 4)
				.map((b) => b.trim()),
		).toEqual(['%', '%'])
	})

	test('a voice on the chord row gets a new rhythm, not notes', () => {
		const line = linesOf(roll(HERMANN, 'A', 'stab', 2).text, 'stab')[0]
		expect(line).toMatch(/^stab\s+\|[xXo.\-\s|]+$/)
	})

	test('a voice a pattern takes from another gets a line of its own there', () => {
		const out = roll(HERMANN, 'B2', 'bass', 1).text
		const b2 = out.slice(out.indexOf('pattern B2'), out.indexOf('pattern intro'))
		expect(linesOf(b2, 'bass')).toHaveLength(1)
		expect(linesOf(out.slice(out.indexOf('pattern B from')), 'bass')[0]).toBe(
			linesOf(HERMANN.slice(HERMANN.indexOf('pattern B from')), 'bass')[0],
		)
	})

	test('nothing to roll is null', () => {
		expect(roll(HERMANN, 'A', 'nobody', 1)).toBeNull()
		expect(roll(HERMANN, 'nowhere', 'bass', 1)).toBeNull()
	})
})
