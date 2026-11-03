import { expect, test } from 'bun:test'
import { CHORDS, chordToMidis, compile, parse } from '../src/score.js'
import { setSongKey } from '../src/key.js'
import { suggest } from '../src/ui/complete.js'
import { chordNotes } from '../src/ui/hints.js'
import { mistakes } from '../src/ui/lint.js'
import { paint } from '../src/ui/paint.js'
import { parseKey } from '../src/score.js'

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const name = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1)
const names = (ms) => ms.map(name).join(' ')

const song = (body, voices = 'voice pad pad') => compile(`${voices}\npattern A\n${body}\nloop A`)
// Each event of voice `v` as [step in the pattern, its notes].
const played = (s, v = 0) => s.loop.events.filter((e) => e.v === v).map((e) => [e.b * 16 + e.st, names(e.m)])

test('a chord row shares each bar evenly; - holds, . has none', () => {
	const s = song('chords | Dm9 | Gm9 | Bbmaj9 C6/9 | Am - - G | F . |\npad | x--------------- | % | % | % | % |')
	expect(s.errors).toEqual([])
	expect(s.loop.sections[0].chords).toEqual([
		{ step: 0, len: 16, sym: 'Dm9' },
		{ step: 16, len: 16, sym: 'Gm9' },
		{ step: 32, len: 8, sym: 'Bbmaj9' },
		{ step: 40, len: 8, sym: 'C6/9' },
		{ step: 48, len: 12, sym: 'Am' },
		{ step: 60, len: 4, sym: 'G' },
		{ step: 64, len: 8, sym: 'F' },
	])
	// A held chord is struck again where the row changes, and stops where it has none.
	expect(played(s).map(([st]) => st)).toEqual([0, 16, 32, 40, 48, 60, 64])
})

test('the last chord rings on, and % and _ work as in notes', () => {
	const s = song('chords | Am | % | _ | C |\npad | x... .... .... .... | x... | x... .... .... .... | x... | x... .... .... .... |')
	expect(played(s).map(([st]) => st)).toEqual([0, 16, 48, 64])
})

test('a from pattern inherits the row; chords@ patches it', () => {
	const s = compile(
		`voice pad pad\npattern A\nchords | C | F | G | C |\npad | x--------------- | % | % | % |\npattern B from A\nchords@3 | Am |\nloop A B`,
	)
	expect(s.errors).toEqual([])
	expect(s.loop.sections[1].chords.map((c) => c.sym)).toEqual(['C', 'F', 'Am', 'C'])
})

test('+5 on the loop line and the key switch move the row', () => {
	const s = compile(`voice bass 808 part=root\npattern A\nchords | Dm |\nbass | x... .... .... .... |\nloop A A+5`)
	expect(s.loop.events.map((e) => name(e.m[0]))).toEqual(['D2', 'G2'])
	expect(setSongKey('key Dm\npattern A\nchords | Dm9 | Bbmaj9 C6/9 | - . % |', 'Em')).toContain('chords | Em9 | Cmaj9 D6/9 | - . % |')
})

test('part says what a voice plays of the chord', () => {
	const voices = 'voice pad pad\nvoice bass 808 part=root\nvoice top pad part=top\nvoice arp chip part=up\nvoice keys rhodes part=rootless'
	const s = song(
		'chords | Dm9 | C/E |\npad | x... .... .... .... |\nbass | x... .... .... .... | x... .... .... .... |\ntop | x... .... .... .... |\narp | xxxx xx.. .... .... |\nkeys | x... .... .... .... |',
		voices,
	)
	expect(s.errors).toEqual([])
	expect(played(s, 0)).toEqual([[0, 'D3 F3 A3 C4 E4']])
	expect(played(s, 1)).toEqual([
		[0, 'D2'],
		[16, 'E2'],
	])
	expect(played(s, 2)).toEqual([[0, 'E4']])
	expect(played(s, 3).map(([, n]) => n)).toEqual(['D3', 'F3', 'A3', 'C4', 'E4', 'D3'])
	expect(played(s, 4)).toEqual([[0, 'F3 A3 C4 E4']])
})

test('chords move to the nearest voicing', () => {
	const s = song('chords | C | G | Am | F |\npad | x--------------- | % | % | % |')
	expect(played(s).map(([, n]) => n)).toEqual(['C4 E4 G4', 'B3 D4 G4', 'C4 E4 A4', 'C4 F4 A4'])
})

test('x bars and note bars mix, and plain songs are untouched', () => {
	const s = song('chords | Am |\npad | x... ..x. .... .... | A4--- .... .... .... |')
	expect(s.errors).toEqual([])
	expect(played(s).map(([st]) => st)).toEqual([0, 6, 16])
	expect(song('pad | [Am] |').loop.events[0].m.map(name)).toEqual(['A3', 'C4', 'E4'])
})

test("extended chords sit above the octave, like a pianist's", () => {
	expect(names(chordToMidis('Dm9', 62))).toBe('D3 F3 A3 C4 E4')
	expect(names(chordToMidis('Dm11', 62))).toBe('D3 F3 A3 C4 E4 G4')
	for (const kind of ['m11', '11', '13', 'add9', '6/9', 'sus2', 'sus4', '7sus4', 'dim7', 'm7b5']) expect(CHORDS[kind]).toBeTruthy()
	expect(chordToMidis('C6/9/E', 62)).toBeTruthy()
	expect(chordNotes('Dm9')).toBe('D3 F3 A3 C4 E4')
})

test('plain errors, each with a fix', () => {
	const check = (text) => {
		const s = compile(text)
		return [...mistakes(text, s.errors).values()].flat()
	}
	const [unknown] = check('voice pad pad\npattern A\nchords | Dmm9 |\npad | x... .... .... .... |\nloop A')
	expect(unknown.msg).toBe('No chord called Dmm9')
	expect(unknown.fix.to).toBe('Dm9')
	const [bracket] = check('voice pad pad\npattern A\nchords | [Dm9] |\npad | x... .... .... .... |\nloop A')
	expect(bracket.fix.to).toBe('Dm9')
	const text = 'key Dm\nvoice pad pad\npattern A\npad | x... .... .... .... |\nloop A'
	const [none] = check(text)
	expect(none.msg).toBe('No chords to follow')
	expect(none.fix.to).toBe('chords | Dm |\n')
	const [part] = check('voice pad pad part=roots\npattern A\npad | A4 |\nloop A')
	expect(part.fix.to).toBe('root')
	expect(parse('voice chords pad').errors[0].msg).toBe('chords is the chord row')
})

test('the editor suggests and colours the row', () => {
	const key = parseKey('Dm')
	const head = 'key Dm\nvoice pad pad\npattern A\n'
	expect(suggest(head + 'cho', head.length + 3, key).items[0].insert).toBe('chords | ')
	expect(suggest(head + 'chords |', head.length + 8, key).items[0].insert).toBe(' Dm | Bb | F | C |')
	expect(suggest(head + 'chords | G', head.length + 10, key).items[0].word).toBe('Gm')
	expect(suggest('voice a pad part=r', 18, key).items[0].word).toBe('root')
	const kinds = paint('chords | Dm9 - | % |', ['pad']).filter(([k]) => k !== 'space')
	expect(kinds).toEqual([
		['word', 'chords', undefined],
		['bar', '|', undefined],
		['chord', 'Dm9', undefined],
		['same', '-', undefined],
		['bar', '|', undefined],
		['same', '%', undefined],
		['bar', '|', undefined],
	])
})
