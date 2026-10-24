import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { compile, noteToMidi } from '../src/score.js'
import { mtof } from '../src/synth.js'
import { HEAR, cueAt, join, shape } from '../src/player.js'

const dir = new URL('../music/', import.meta.url)
const SCORES = readdirSync(dir)
	.filter((f) => f.endsWith('.song'))
	.map((f) => f.slice(0, -'.song'.length))
const score = (name) => compile(readFileSync(new URL(`${name}.song`, dir), 'utf8'))

describe('scores', () => {
	test('there are songs', () => expect(SCORES.length).toBeGreaterThan(0))
	for (const name of SCORES) {
		test(`${name} plays without errors and loops`, () => {
			const song = score(name)
			expect(song.errors).toEqual([])
			expect(song.loop.dur).toBeGreaterThan(10)
		})
	}
})

describe('quarter tones', () => {
	test('q is a half-flat, a quarter tone under the note', () => {
		expect(noteToMidi('Eq4')).toBe(63.5)
		expect(noteToMidi('Bq3')).toBe(58.5)
		expect(mtof(63.5) / mtof(63)).toBeCloseTo(2 ** (1 / 24))
	})

	test('half-flats play, in melodies and glides', () => {
		const song = compile(`voice oud oud
pattern A
oud | D4- Eq4- F4- ~Eq4- D4------- |`)
		expect(song.errors).toEqual([])
		const notes = song.loop.events.map((e) => e.m[0])
		expect(notes).toEqual([62, 63.5, 65, 63.5, 62])
		expect(song.loop.events[3].g).toBe(65)
	})

	test('the Sonnenallee songs are in a maqam with quarter tones', () => {
		for (const name of ['sonnenallee', 'sonnenallee-nacht']) {
			const song = score(name)
			expect(song.street).toBe('Sonnenallee')
			expect(song.loop.events.some((e) => e.m?.some((m) => m % 1))).toBe(true)
		}
	})
})

describe('songs say where they belong', () => {
	test('street and at in the head', () => {
		expect(score('konvoi').at).toEqual([])
		expect(score('hasenheide').at).toEqual(['cafe'])
		for (const name of ['tempelhof', 'luftbruecke']) expect(score(name).at).toEqual(['feld'])
		expect(compile('at Doener  cafe\nvoice a sine\npattern A\na | C4 |').at).toEqual(['doener', 'cafe'])
	})
})

describe('playing from a distance', () => {
	test('a wedding convoy carries much further than a car radio, and louder', () => {
		const far = shape('convoy', HEAR * 1.5)
		const near = shape('convoy', 5)
		expect(far.level).toBeGreaterThan(0)
		expect(shape('car', HEAR * 1.5).level).toBe(0)
		expect(near.level).toBeGreaterThan(far.level)
		expect(near.cutoff).toBeGreaterThan(far.cutoff)
		expect(near.level).toBeGreaterThan(shape('car', 5).level)
	})

	test('coming back, a source carries on where its song had got to', () => {
		const song = score('hermannplatz')
		expect(cueAt(song, 0)).toEqual({ list: 'intro', i: 0, offset: 0 })
		const later = song.intro.dur + song.loop.dur * 3 + 5
		const cue = cueAt(song, later)
		expect(cue.list).toBe('loop')
		expect(cue.offset).toBeCloseTo(song.intro.dur + song.loop.dur * 3)
		const next = song.loop.events[cue.i]
		expect(cue.offset + next.t).toBeGreaterThanOrEqual(later)
		expect(cue.offset + song.loop.events[cue.i - 1].t).toBeLessThan(later)
	})

	test('a source joined later is further on in its song', () => {
		const song = score('hermannplatz')
		const first = join(song, 100, 5)
		const again = join(song, 100, 5 + 25)
		expect(first.start).toBe(again.start)
		const at = (j) => j.cue.offset + song[j.cue.list].events[j.cue.i].t
		expect(at(again)).toBeGreaterThan(at(first) + 20)
		expect(first.start + at(first)).toBeGreaterThanOrEqual(5)
	})
})
