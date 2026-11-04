import { describe, expect, test } from 'bun:test'
import { compile, parseKey } from '../src/score.js'
import { starter } from '../src/key.js'
import { growRepeats } from '../src/bricks.js'
import { addPad, barsOf, chordLadder, harmonyVoice, padChords, writeChord } from '../src/ui/pad.js'

const rowOf = (text, name = 'A') => compile(text, name).loop.sections[0].chords.map((c) => c.sym)
// Every tap leaves a song that still compiles.
const ok = (out) => {
	expect(out).not.toBeNull()
	expect(compile(out.text).errors).toEqual([])
	return out
}

describe('the pad', () => {
	test("lays the key's chords in the middle, its neighbours round the circle", () => {
		const cols = padChords(parseKey('C'))
		expect(cols.map((c) => c.major)).toEqual(['Eb', 'Bb', 'F', 'C', 'G', 'D', 'A'])
		expect(cols.map((c) => c.minor)).toEqual(['Cm', 'Gm', 'Dm', 'Am', 'Em', 'Bm', 'F#m'])
		expect(cols.map((c) => c.far)).toEqual([2, 1, 0, 0, 0, 1, 2])
		expect(cols[3].home).toBe('major')
	})
	test('a minor key sits on its relative major, home below', () => {
		const cols = padChords(parseKey('Dm'))
		expect(cols[3]).toMatchObject({ major: 'F', minor: 'Dm', home: 'minor' })
		expect(padChords(parseKey('E')).map((c) => c.major)).toEqual(['G', 'D', 'A', 'E', 'B', 'F#', 'C#'])
	})
	test('a modifier colours every chord, the dominant side a dominant 7th', () => {
		const cols = padChords(parseKey('C'), '7')
		expect(cols.slice(2, 5).flatMap((c) => [c.major, c.minor])).toEqual(['Fmaj7', 'Dm7', 'Cmaj7', 'Am7', 'G7', 'Em7'])
		expect(padChords(parseKey('C'), '9')[3].minor).toBe('Am9')
		expect(padChords(parseKey('C'), 'add9')[2].minor).toBe('Dmadd9')
		for (const mod of ['7', '9', 'sus', 'add9'])
			for (const c of padChords(parseKey('Bb'), mod))
				expect(compile(`pattern A\nchords | ${c.major} ${c.minor} |\nloop A`).errors).toEqual([])
	})
})

describe('a chord tapped in', () => {
	test('starts a new song with a pattern and its row', () => {
		const t = starter('C', { title: 'Velvet Echo' })
		let out = ok(writeChord(t, 'A', 0, 'Am'))
		expect(out.text.endsWith('\npattern A\nchords | Am |\n\nloop A\n')).toBe(true)
		expect(out.text.split('\n')[out.ln - 1].slice(out.col, out.col + 2)).toBe('Am')
		for (const [bar, sym] of [
			[1, 'F'],
			[2, 'C'],
			[3, 'G'],
		])
			out = ok(writeChord(out.text, 'A', bar, sym))
		expect(out.text).toContain('chords | Am | F | C | G |')
		expect(barsOf(out.text, 'A')).toEqual({ row: 4, voices: 0 })
	})
	test('replaces a bar in place, keeping the bar that repeated it', () => {
		const t = 'pattern A\nchords | Dm | % | Gm |\nloop A'
		const out = ok(writeChord(t, 'A', 0, 'Bbmaj7'))
		expect(out.text.split('\n')[1]).toBe('chords | Bbmaj7 | Dm | Gm |')
		expect(ok(writeChord(t, 'A', 2, 'C')).text.split('\n')[1]).toBe('chords | Dm | % | C |')
	})
	test('past the row, the bars between repeat the last chord', () => {
		const out = ok(writeChord('pattern A\nchords | Dm |\nloop A', 'A', 3, 'C'))
		expect(out.text.split('\n')[1]).toBe('chords | Dm | % | % | C |')
		expect(rowOf(out.text)).toEqual(['Dm', 'C'])
	})
	test('a pattern without a row gets one under its name', () => {
		const t = 'voice kick kick\npattern A\nkick | x... x... x... x... | % |\nloop A'
		const out = ok(writeChord(t, 'A', 1, 'Em'))
		expect(out.text.split('\n').slice(1, 3)).toEqual(['pattern A', 'chords | _ | Em |'])
		expect(out.ln).toBe(3)
	})
	test('a pattern built on another patches its row and leaves the other as it was', () => {
		const t = 'pattern A\nchords | C | F | G | C |\npattern B from A\nloop A B'
		let out = ok(writeChord(t, 'B', 2, 'Am'))
		expect(out.text.split('\n')[3]).toBe('chords@3 | Am |')
		out = ok(writeChord(out.text, 'B', 3, 'F'))
		expect(out.text.split('\n')[3]).toBe('chords@3 | Am | F |')
		out = ok(writeChord(out.text, 'B', 2, 'Dm'))
		expect(out.text.split('\n')[3]).toBe('chords@3 | Dm | F |')
		expect(rowOf(out.text, 'A')).toEqual(['C', 'F', 'G', 'C'])
		expect(rowOf(out.text, 'B')).toEqual(['C', 'F', 'Dm', 'F'])
	})
})

describe('tapping a progression', () => {
	test('each tap the next bar, and the bricks follow across them all', () => {
		let t =
			'key C\nvoice kick kick\nvoice pad pad vol=0.35\npattern A\nchords | C |\nkick | x... x... x... x... |\npad  | x--- ---- ---- ---- |\nloop A'
		;['Am', 'F', 'G', 'C'].forEach((sym, bar) => {
			const was = t
			t = growRepeats(ok(writeChord(t, 'A', bar, sym)).text, was)
		})
		expect(t).toContain('chords | Am | F | G | C |')
		expect(t).toContain('kick | x... x... x... x... | % | % | % |')
		expect(t).toContain('pad  | x--- ---- ---- ---- | % | % | % |')
		expect(barsOf(t, 'A')).toEqual({ row: 4, voices: 4 })
	})
})

describe('a pad to play them', () => {
	test('holds each bar of the row in every pattern', () => {
		const t = writeChord(starter('C'), 'A', 0, 'Am').text.replace('| Am |', '| Am | F | C | G |')
		expect(harmonyVoice(t)).toBeNull()
		const out = addPad(t)
		expect(out.voice).toBe('pad')
		expect(out.text).toContain(
			'voice pad pad vol=0.4 rev=0.6 bright=0.8\n\npattern A\nchords | Am | F | C | G |\npad | x--------------- | % | % | % |\n',
		)
		expect(compile(out.text).errors).toEqual([])
		expect(harmonyVoice(out.text)).toBe('pad')
	})
	test('takes a free name, after the voices, the length of the pattern', () => {
		const t =
			'beats 3\nvoice pad organ\nvoice bass 808 part=root\npattern A\nchords | Dm |\npad | D4----------- |\nbass | x.. ... ... ... | % |\nloop A'
		expect(harmonyVoice(t)).toBeNull()
		const out = addPad(t)
		expect(out.voice).toBe('pad2')
		expect(out.text.split('\n')[3]).toBe('voice pad2 pad vol=0.4 rev=0.6 bright=0.8')
		expect(out.text.split('\n').at(-2)).toBe('pad2 | x----------- | % |')
		expect(compile(out.text).errors).toEqual([])
	})
})

describe('a chord dragged', () => {
	test('climbs the circle of fifths in the key, the key’s own chords nearest', () => {
		expect(chordLadder('Dm', parseKey('Dm'))).toEqual({ chords: ['Eb', 'Bb', 'F', 'C', 'Gm', 'Dm', 'Am', 'A7'], home: 5 })
		expect(chordLadder('C', parseKey('C'))).toEqual({ chords: ['Bb', 'F', 'C', 'G', 'Dm', 'Am', 'Em'], home: 2 })
	})
	test('keeps its colour', () => {
		expect(chordLadder('Dm9', parseKey('Dm')).chords).toEqual(['Ebmaj9', 'Bbmaj9', 'Fmaj9', 'C9', 'Gm9', 'Dm9', 'Am9', 'A9'])
		expect(chordLadder('Am7', parseKey('C')).chords).toEqual(['Bbmaj7', 'Fmaj7', 'Cmaj7', 'G7', 'Dm7', 'Am7', 'Em7'])
		expect(chordLadder('C6/9', parseKey('Dm'))).toMatchObject({ home: 3 })
		for (const [sym, key] of [
			['Bbmaj9', 'Dm'],
			['C6/9', 'Dm'],
			['Csus4', 'C'],
			['F#m11', 'A'],
		])
			for (const c of chordLadder(sym, parseKey(key)).chords) expect(compile(`pattern A\nchords | ${c} |\nloop A`).errors).toEqual([])
	})
	test('a chord from outside the key takes its own rung', () => {
		const out = chordLadder('E7', parseKey('C'))
		expect(out.chords.at(-1)).toBe('E7')
		expect(out.home).toBe(7)
	})
})
