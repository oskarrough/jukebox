import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { compile, parseKey } from '../src/score.js'
import { addNote, moveNote, nameOf, placeAt, removeNote, setHit, snap, stretchNote } from '../src/ui/draw.js'

const HEAD = 'key Am\nbeats 1\nvoice lead flute\nvoice bass ebass\nvoice kick kick\n'
const KEY = parseKey('Am')
const at = (tl, i, b, st) => ({ tl, i, off: 0, b, st })
// The lines a change leaves different, in order.
const changed = (before, out) => {
	const a = before.split('\n')
	return out.text.split('\n').filter((l) => !a.includes(l))
}
// Every edit leaves a song that still compiles.
const ok = (out) => {
	expect(out).not.toBeNull()
	expect(compile(out.text).errors).toEqual([])
	return out
}

describe('a note added on the tape', () => {
	test('lands in its bar, keeping the words around it as written', () => {
		const t = HEAD + 'pattern A\nlead | A4 . . . | C5 D5 . . |\nloop A'
		const out = ok(addNote(t, compile(t), at('loop', 0, 1, 2), 'lead', 76, 2, KEY))
		expect(changed(t, out)).toEqual(['lead | A4 . . . | C5 D5 E5- |'])
		expect(out.ln).toBe(7)
		expect(out.text.split('\n')[6].slice(out.col, out.col + 3)).toBe('E5-')
	})
	test('stops at the next note and the end of the bar', () => {
		const t = HEAD + 'pattern A\nlead | . . C5 . |\nloop A'
		expect(changed(t, ok(addNote(t, compile(t), at('loop', 0, 0, 0), 'lead', 69, 4, KEY)))).toEqual(['lead | A4- C5 . |'])
		expect(changed(t, ok(addNote(t, compile(t), at('loop', 0, 0, 3), 'lead', 69, 4, KEY)))).toEqual(['lead | . . C5 A4 |'])
	})
	test('cuts short what was sounding there, or takes its place', () => {
		const t = HEAD + 'pattern A\nlead | A4--- |\nloop A'
		expect(changed(t, ok(addNote(t, compile(t), at('loop', 0, 0, 2), 'lead', 72, 1, KEY)))).toEqual(['lead | A4- C5 . |'])
		expect(changed(t, ok(addNote(t, compile(t), at('loop', 0, 0, 0), 'lead', 72, 1, KEY)))).toEqual(['lead | C5 ... |'])
	})
	test('writes out a % or a = bar first, and leaves the bars that repeat it repeating', () => {
		const t = HEAD + 'pattern A\nlead | A4--- | % | = |\nloop A'
		const s = compile(t)
		expect(changed(t, ok(addNote(t, s, at('loop', 0, 1, 2), 'lead', 72, 2, KEY)))).toEqual(['lead | A4--- | A4- C5- | = |'])
		expect(changed(t, ok(addNote(t, s, at('loop', 0, 2, 2), 'lead', 72, 1, KEY)))).toEqual(['lead | A4--- | % | -- C5 . |'])
	})
	test('a bar the voice has no line for yet gets one, lined up', () => {
		const t = HEAD + 'pattern A\nkick | x... | x... |\nloop A'
		expect(changed(t, ok(addNote(t, compile(t), at('loop', 0, 1, 0), 'bass', 45, 4, KEY)))).toEqual(['bass | _ | A2--- |'])
		const short = HEAD + 'pattern A\nkick | x... | x... | x... |\nbass | A2--- |\nloop A'
		expect(changed(short, ok(addNote(short, compile(short), at('loop', 0, 2, 0), 'bass', 45, 4, KEY)))).toEqual([
			'bass | A2--- | _ | A2--- |',
		])
	})
	test('in a pattern built on another, only that pattern changes', () => {
		const t = HEAD + 'pattern A\nlead | A4 . . . | B4 . . . |\npattern B from A\nkick | x... |\nloop A B'
		const out = ok(addNote(t, compile(t), at('loop', 1, 1, 2), 'lead', 72, 1, KEY))
		expect(changed(t, out)).toEqual(['lead@2 | B4 . C5 . |'])
		const s = compile(out.text)
		const notes = (i) => s.loop.events.filter((e) => e.s === i && e.m).map((e) => e.m[0])
		expect(notes(0)).toEqual([69, 71])
		expect(notes(1)).toEqual([69, 71, 72])
	})
	test('a voice muted in that pattern is left alone', () => {
		const t = HEAD + 'pattern A\nlead | A4 . . . |\npattern B from A\nmute lead\nloop A B'
		expect(addNote(t, compile(t), at('loop', 1, 0, 2), 'lead', 72, 1, KEY)).toBeNull()
	})
	test('a bar that doesn’t add up is left for the score to fix', () => {
		const t = HEAD + 'pattern A\nlead | A4 . . . |\nloop A'
		const s = compile(t)
		const broken = t.replace('A4 . . .', 'A4 . .')
		expect(addNote(broken, s, at('loop', 0, 0, 3), 'lead', 72, 1, KEY)).toBeNull()
	})
	test('in a transposed section, the pitch heard is written in the score’s key', () => {
		const t = HEAD + 'pattern A\nlead | A4 . . . |\nloop A A+5'
		const s = compile(t)
		const place = at('loop', 1, 0, 2)
		const m = snap(s, place, 77 - s.loop.sections[1].trans, KEY)
		expect(m).toBe(72)
		expect(changed(t, ok(addNote(t, s, place, 'lead', m, 1, KEY)))).toEqual(['lead | A4 . C5 . |'])
	})
})

describe('pitches', () => {
	test('snap to the key, and to what the section already plays', () => {
		const t = HEAD + 'pattern A\nlead | A4 G#4 . . |\nloop A'
		const s = compile(t)
		expect(snap(s, at('loop', 0, 0, 0), 61.4, KEY)).toBe(62)
		expect(snap(s, at('loop', 0, 0, 0), 68.2, KEY)).toBe(68)
	})
	test('quarter tones the song uses are there to land on', () => {
		const t = HEAD + 'pattern A\nlead | D4 Eq4 F4 . |\nloop A'
		expect(snap(compile(t), at('loop', 0, 0, 3), 63.6, KEY)).toBe(63.5)
		expect(nameOf(t, 75.5, KEY)).toBe('Eq5')
	})
	test('are spelt the way the score spells them', () => {
		expect(nameOf('pattern A\nlead | Eb4 F#4 . . |', 75, KEY)).toBe('Eb5')
		expect(nameOf('pattern A\nlead | Eb4 F#4 . . |', 66, KEY)).toBe('F#4')
		expect(nameOf('', 70, parseKey('F'))).toBe('Bb4')
	})
})

describe('a note dragged, stretched or deleted', () => {
	const t = HEAD + 'pattern A\nlead | A4- . . | C5!- . . |\nloop A'
	test('moves with its marks, across bars too', () => {
		const s = compile(t)
		expect(changed(t, ok(moveNote(t, s, at('loop', 0, 0, 0), at('loop', 0, 0, 1), 'lead', 2, KEY)))).toEqual([
			'lead | . B4- . | C5!- . . |',
		])
		expect(changed(t, ok(moveNote(t, s, at('loop', 0, 1, 0), at('loop', 0, 0, 2), 'lead', 0, KEY)))).toEqual([
			'lead | A4- C5!- | . . . . |',
		])
	})
	test('a chord moves whole', () => {
		const c = HEAD + 'pattern A\nlead | [Am]--- |\nloop A'
		expect(changed(c, ok(moveNote(c, compile(c), at('loop', 0, 0, 0), at('loop', 0, 0, 0), 'lead', 3, KEY)))).toEqual(['lead | [Cm]--- |'])
	})
	test('stretches as far as the next note', () => {
		const s = compile(t)
		expect(changed(t, ok(stretchNote(t, s, at('loop', 0, 1, 0), 'lead', 3)))).toEqual(['lead | A4- . . | C5!-- . |'])
		expect(changed(t, ok(stretchNote(t, s, at('loop', 0, 0, 0), 'lead', 1)))).toEqual(['lead | A4 . . . | C5!- . . |'])
		expect(changed(t, ok(stretchNote(t, s, at('loop', 0, 0, 0), 'lead', 9)))).toEqual(['lead | A4--- | C5!- . . |'])
	})
	test('deletes', () => {
		expect(changed(t, ok(removeNote(t, compile(t), at('loop', 0, 1, 1), 'lead')))).toEqual(['lead | A4- . . | . . . . |'])
	})
})

describe('a drum lane clicked', () => {
	test('switches the step, keeping the bar’s spacing', () => {
		const t = HEAD.replace('beats 1', 'beats 2') + 'pattern A\nkick | x... x... | % |\nloop A'
		const s = compile(t)
		expect(changed(t, ok(setHit(t, s, at('loop', 0, 0, 2), 'kick', true)))).toEqual(['kick | x.x. x... | % |'])
		expect(changed(t, ok(setHit(t, s, at('loop', 0, 1, 4), 'kick', false)))).toEqual(['kick | x... x... | x... .... |'])
		expect(setHit(t, s, at('loop', 0, 0, 0), 'kick', true)).toBeNull()
	})
})

describe('the tape and the clock', () => {
	test('a moment is a bar and a step, swing and all', () => {
		const t = HEAD + 'tempo 60\nswing 0.5\npattern A\nlead | A4 . . . |\nloop A'
		const s = compile(t)
		expect(placeAt(t, s, 0.3)).toMatchObject({ tl: 'loop', b: 0, st: 0 })
		expect(placeAt(t, s, 0.33)).toMatchObject({ st: 0 })
		expect(placeAt(t, s, 0.4)).toMatchObject({ st: 1 })
		expect(placeAt(t, s, 1.3)).toMatchObject({ b: 0, st: 0, off: 1 })
	})
	test('Maybachufer: a saz note in the chorus lands in the chorus', () => {
		const t = readFileSync(new URL('../music/maybachufer.song', import.meta.url), 'utf8')
		const s = compile(t)
		const i = s.loop.sections.findIndex((x) => x.name === 'B2')
		// B2 is built on B: the fuzz bar gets a line of its own in B2
		const out = ok(moveNote(t, s, at('loop', i, 0, 0), at('loop', i, 0, 0), 'fuzz', 2, parseKey('Dm')))
		expect(changed(t, out)).toEqual(['fuzz@1 | B4- A4 . Bb4 A4 G4- F#4 G4 F#4- Eb4 D4-- |'])
		expect(out.text.split('\n')[out.ln - 2]).toStartWith('neyhi')
	})
})

describe('drawing with a chosen voice', () => {
	const text = 'key C\nvoice pad pad\nvoice bass ebass\npattern A\npad | [C]--------------- |\nbass | _ |\nloop A'

	test('drawing bass over the pad leaves its whole-bar chord intact', () => {
		const out = ok(addNote(text, compile(text), at('loop', 0, 0, 2), 'bass', 48, 7, parseKey('C')))
		expect(changed(text, out)).toEqual(['bass | .. C3------ ....... |'])
		expect(out.text).toContain('pad | [C]--------------- |')
		const pad = compile(out.text).loop.events.find((e) => e.v === 0)
		expect(pad.m).toHaveLength(3)
		expect(pad.d).toBe(compile(text).loop.events[0].d)
	})

	test('moving, stretching and deleting the bass never edits the pad', () => {
		const drawn = ok(addNote(text, compile(text), at('loop', 0, 0, 2), 'bass', 48, 4, parseKey('C'))).text
		const moved = ok(moveNote(drawn, compile(drawn), at('loop', 0, 0, 2), at('loop', 0, 0, 4), 'bass', 2, parseKey('C'))).text
		const stretched = ok(stretchNote(moved, compile(moved), at('loop', 0, 0, 4), 'bass', 8)).text
		const removed = ok(removeNote(stretched, compile(stretched), at('loop', 0, 0, 4), 'bass')).text
		for (const t of [drawn, moved, stretched, removed]) expect(t).toContain('pad | [C]--------------- |')
	})
})
