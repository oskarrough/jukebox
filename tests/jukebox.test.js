import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { compile, noteToMidi, parseKey } from '../src/score.js'
import { mtof } from '../src/synth.js'
import { HEAR, cueAt, join, shape, runChain, effectState, EFFECTS } from '../src/player.js'
import { BRICKS, addBrick } from '../src/bricks.js'
import { inferKey, keyOf, setSongKey, starter, transposeScore } from '../src/key.js'

const STARTER_ISH = 'voice kick kick\npattern A\nkick | x... x... x... x... |\nloop A'

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

describe('loop bricks', () => {
	test('every brick drops into every song and plays', () => {
		for (const name of SCORES) {
			const text = readFileSync(new URL(`${name}.song`, dir), 'utf8')
			for (const brick of BRICKS) {
				const { text: next, voice } = addBrick(text, brick)
				const song = compile(next)
				expect(song.errors).toEqual([])
				expect(song.voices.map((v) => v.name)).toContain(voice)
			}
		}
	})

	test('a brick stretches to a bar of three beats', () => {
		const text = 'beats 3\nvoice a sine\npattern A\na | C4----------- |\nloop A'
		for (const brick of BRICKS) expect(compile(addBrick(text, brick).text).errors).toEqual([])
	})

	test('a second brick of the same kind gets its own voice', () => {
		const once = addBrick(STARTER_ISH, BRICKS[0]).text
		expect(addBrick(once, BRICKS[0]).voice).toBe('kick3')
	})
})

describe('effects rack', () => {
	test('Source, Distance and Inferno are devices in the chain', () => {
		expect(EFFECTS.map((fx) => fx.id)).toEqual(['source', 'distance', 'inferno'])
	})

	test('all on with the current settings matches the old shape()', () => {
		const fx = effectState()
		for (const kind of ['radio', 'bar', 'window', 'car', 'convoy']) {
			for (const d of [0, 4, 18, 40]) {
				fx.source.kind = kind
				fx.distance.d = d
				fx.inferno.inCar = false
				const a = shape(kind, d)
				const b = runChain(fx)
				expect(b.level).toBeCloseTo(a.level)
				expect(b.wet).toBeCloseTo(a.wet)
				expect(b.cutoff).toBeCloseTo(a.cutoff)
			}
		}
		const muffled = runChain({ ...effectState(), inferno: { on: true, inCar: true } })
		const old = shape('radio', 4, false, true)
		expect(muffled.level).toBeCloseTo(old.level)
		expect(muffled.cutoff).toBeCloseTo(old.cutoff)
	})

	test('each device can be bypassed on its own', () => {
		const far = runChain({ source: { on: true, kind: 'bar' }, distance: { on: false, d: 20 }, inferno: { on: true, inCar: false } })
		expect(far.level).toBeCloseTo(shape('bar', 0).level)
		expect(far.cutoff).toBeCloseTo(shape('bar', 0).cutoff)

		const cabin = runChain({ source: { on: true, kind: 'radio' }, distance: { on: true, d: 4 }, inferno: { on: false, inCar: true } })
		expect(cabin.level).toBeCloseTo(shape('radio', 4, false, false).level)

		const dry = runChain({ source: { on: false, kind: 'car' }, distance: { on: false, d: 20 }, inferno: { on: false, inCar: true } })
		expect(dry.level).toBeCloseTo(1)
		expect(dry.cutoff).toBeGreaterThan(8000)
	})
})

describe('song key', () => {
	test('key in the head is parsed, and songs in music/ still play without one', () => {
		expect(parseKey('C').pc).toBe(0)
		expect(parseKey('Dm')).toEqual({ letter: 'D', acc: '', minor: true, pc: 2, name: 'Dm' })
		expect(parseKey('F#').name).toBe('F#')
		expect(compile('key G\nvoice a sine\npattern A\na | G4 |\nloop A').key.name).toBe('G')
		for (const name of SCORES) expect(score(name).key).toBeNull()
	})

	test('new songs and bricks follow the key, instead of always landing in C', () => {
		const inG = starter('G')
		expect(inG).toMatch(/^key\s+G$/m)
		expect(inG).toMatch(/G5-/)
		expect(inG).toMatch(/\[G\]/)
		expect(inG).not.toMatch(/\[C\]/)
		const pulse = BRICKS.find((b) => b.id === 'pulse')
		const { text } = addBrick('key G\nvoice a sine\npattern A\na | G4 |\nloop A', pulse)
		expect(text).toMatch(/G2/)
		expect(text).not.toMatch(/C2/)
		const { text: inC } = addBrick('key C\nvoice a sine\npattern A\na | C4 |\nloop A', pulse)
		expect(inC).toMatch(/C2/)
	})

	test('changing key transposes notes and chords in the score', () => {
		const moved = setSongKey('key C\nvoice pad strings center=E4\npattern A\npad | [C] [Am] C4 |\nloop A', 'D')
		expect(moved).toMatch(/^key\s+D$/m)
		expect(moved).toMatch(/\[D\].*\[Bm\].*D4/)
		expect(moved).toMatch(/center=F#4/)
		expect(transposeScore('lead | C5- Eq4- |', 5, parseKey('F'))).toMatch(/F5-.*Aq4-/)
		expect(keyOf('voice a sine\npattern A\na | G4 G4 D5 |\nloop A').pc).toBe(7)
		expect(inferKey(compile('voice a sine\npattern A\na | G4 G4 D5 B4 |\nloop A')).name).toMatch(/^G/)
	})
})
