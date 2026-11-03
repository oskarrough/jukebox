import { expect, test } from 'bun:test'
import { compile } from '../src/score.js'
import { starter } from '../src/key.js'
import { STARTERS } from '../src/starters.js'
import { measure, render } from '../scripts/render.js'

test('the styles are named, distinct, and a blank song is not one of them', () => {
	expect(STARTERS.length).toBeGreaterThan(3)
	expect(new Set(STARTERS.map((s) => s.id)).size).toBe(STARTERS.length)
	expect(STARTERS.map((s) => s.id)).not.toContain('')
})

for (const { id, key } of STARTERS) {
	test(`the ${id} style compiles cleanly, loops, and keeps the title and tag`, () => {
		const song = compile(starter('C', { title: 'Velvet Echo', tag: 'wip', style: id }))
		expect(song.errors).toEqual([])
		expect(song.title).toBe('Velvet Echo')
		expect(song.tags).toEqual(['wip'])
		expect(song.key.name).toBe(key)
		expect(song.loop.events.length).toBeGreaterThan(0)
		expect(song.loop.dur).toBeGreaterThan(8)
		expect(song.loop.dur).toBeLessThan(60)
	})

	test(`the ${id} style renders loud enough and without clipping`, async () => {
		const song = compile(starter('C', { style: id }))
		const levels = measure(await render(song, 12))
		expect(levels.rms).toBeGreaterThan(0.01)
		expect(levels.clipped).toBe(0)
	}, 30000)
}

test('no style, or one that does not exist, is the blank head', () => {
	expect(starter('C', { style: 'nope' })).toBe(starter('C'))
	expect(compile(starter('C')).loop.events).toEqual([])
})
