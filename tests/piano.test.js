import { describe, expect, test } from 'bun:test'
import { compile, parseKey } from '../src/score.js'
import { noteOf, octaveAt, pianoKeys } from '../src/ui/keyboard.js'
import { barText, cellsOf, moment, place, record, recordStep, stepNote } from '../src/ui/record.js'

const head = 'tempo 120\nbeats 4\nsteps 4\nvoice bass ebass\nvoice lead square\nvoice kick kick\n'
// At 120 a step is 0.125 s and a bar of 16 two seconds.
const STEP = 0.125
const songOf = (t) => {
	const s = compile(t, 'A')
	expect(s.errors).toEqual([])
	return s
}
const take = (t, notes) => {
	for (const n of notes) t = record(t, songOf(t), { voice: 'bass', ...n }).text
	return t
}
const line = (t, voice) => t.split('\n').find((l) => l.startsWith(voice))

describe('the piano keys', () => {
	test('the home row plays the scale, from its keynote', () => {
		const row = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK']
		expect(row.map((k) => noteOf(k, 4, parseKey('C')))).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'])
		expect(row.map((k) => noteOf(k, 2, parseKey('Dm')))).toEqual(['D2', 'E2', 'F2', 'G2', 'A2', 'Bb2', 'C3', 'D3'])
		expect(row.map((k) => noteOf(k, 4, parseKey('E')))).toEqual(['E4', 'F#4', 'G#4', 'A4', 'B4', 'C#5', 'D#5', 'E5'])
	})

	test('the row above plays what lies between, where there is a gap', () => {
		expect(noteOf('KeyW', 4, parseKey('C'))).toBe('C#4')
		expect(noteOf('KeyR', 4, parseKey('C'))).toBeNull()
		expect(noteOf('KeyE', 2, parseKey('Dm'))).toBeNull()
		expect(noteOf('KeyR', 2, parseKey('Dm'))).toBe('Gb2')
		expect(noteOf('KeyQ', 4, parseKey('C'))).toBeNull()
		expect(noteOf('KeyA', 4, null)).toBe('C4')
		expect(octaveAt('lead | A2- C3 ', 14)).toBe(2)
		expect(octaveAt('lead | E4- D#5 E5 |', 3, parseKey('E'))).toBe(4)
		expect(octaveAt('bass | D2 C3 D3 | # E1', 0, parseKey('Dm'))).toBe(2)
		expect(octaveAt('bass | ........ |', 0)).toBeNull()
	})
})

describe('a bar as steps', () => {
	test('reads and writes back the same music', () => {
		const cells = cellsOf(' C4--- .... E4! .. G4- ', 16)
		expect(cells.length).toBe(16)
		expect(barText(cells, 4)).toBe(' C4--- .... E4! .. G4- ... ')
		expect(cellsOf('%', 4, ['A4', '-', '.', '.'])).toEqual(['A4', '-', '.', '.'])
		expect(cellsOf('_', 4)).toEqual(['.', '.', '.', '.'])
	})

	test('a note replaces what it covers and what it cut into', () => {
		const cells = cellsOf('C4------- G4-------', 16)
		expect(barText(place(cells, 2, 2, 'E4'), 4)).toBe(' C4- E4- .... G4------- ')
		expect(barText(place(cells, 0, 1, 'E4', true), 4)).toBe(' C4+E4------- G4------- ')
	})
})

describe('recording while it plays', () => {
	const A = `${head}pattern A\nbass | ................ | ................ |\nkick | x... x... x... x... |\nloop A`

	test('a note lands on the nearest step, as long as it was held', () => {
		const t = take(A, [{ note: 'D2', from: 4 * STEP + 0.04, to: 8 * STEP }])
		expect(line(t, 'bass')).toBe('bass | .... D2--- .... .... | ................ |')
		expect(songOf(t).errors).toEqual([])
	})

	test('round the loop, into the bar playing then, over what was there', () => {
		// The second time round, bar 2.
		const t = take(A, [
			{ note: 'D2', from: 8 + 2 + 0, to: 8 + 2 + 2 * STEP },
			{ note: 'F2', from: 8 + 2 + STEP, to: 8 + 2 + 3 * STEP },
		])
		expect(line(t, 'bass')).toBe('bass | ................ | D2 F2- . .... .... .... |')
	})

	test('a note held over the bar line carries on, and stops at the end of the pattern', () => {
		const t = take(A, [{ note: 'A1', from: 14 * STEP, to: 22 * STEP }])
		expect(line(t, 'bass')).toBe('bass | .... .... .... .. A1- | ------ .. .... .... |')
		const end = take(A, [{ note: 'A1', from: 30 * STEP, to: 40 * STEP }])
		expect(line(end, 'bass')).toBe('bass | ................ | .... .... .... .. A1- |')
	})

	test('a note ending on the bar line cuts what held into the next bar', () => {
		const t = take(`${head}pattern A\nbass | C2--------------- | ---- .... .... .... |\nloop A`, [
			{ note: 'D2', from: 12 * STEP, to: 16 * STEP },
		])
		expect(line(t, 'bass')).toBe('bass | C2----------- D2--- | .... .... .... .... |')
	})

	test('a voice with no line in the pattern gets one', () => {
		const t = take(`${head}pattern A\nkick   | x... x... x... x... | % |\n\nloop A`, [{ note: 'D2', from: 0, to: STEP }])
		expect(line(t, 'bass')).toBe('bass   | D2 ... .... .... .... | .... .... .... .... |')
		expect(t.split('\n').indexOf(line(t, 'bass'))).toBe(t.split('\n').indexOf(line(t, 'kick')) + 1)
		expect(songOf(t).errors).toEqual([])
	})

	test('notes pressed together make a chord', () => {
		const s = songOf(A)
		let t = record(A, s, { voice: 'bass', note: 'D2', from: 0, to: STEP * 4 }).text
		t = record(t, songOf(t), { voice: 'bass', note: 'A2', from: 0.02, to: STEP * 2, chord: true }).text
		expect(line(t, 'bass')).toBe('bass | D2+A2--- .... .... .... | ................ |')
	})

	test('the moment rounds to the next pattern when you play just ahead of it', () => {
		const s = compile(`${head}pattern A\nbass | ................ |\npattern B\nbass | ................ |\nloop A B`)
		expect(moment(s, 2 - 0.03).s.name).toBe('B')
		expect(moment(s, 4 - 0.03)).toMatchObject({ step: 0 })
		expect(moment(s, 4 - 0.03).s.name).toBe('A')
	})
})

describe('writing while stopped', () => {
	const A = `${head}pattern A\nlead | ................ |\nloop A`
	const at = (t, col) => t.indexOf('lead |') + col

	test('each note lasts to the next beat and the caret moves past it', () => {
		let t = A
		let pos = at(t, 7)
		for (const n of ['C4', 'D4', 'E4']) ({ text: t, caret: pos } = stepNote(t, pos, n, { beats: 4, steps: 4 }))
		expect(line(t, 'lead')).toBe('lead | C4--- D4--- E4--- .... |')
		expect(t.slice(pos, pos + 4)).toBe('....')
	})

	test('a full bar moves on to the next one, never overfilling', () => {
		let t = A
		let pos = at(t, 7)
		for (const n of ['C4', 'D4', 'E4', 'F4', 'G4']) ({ text: t, caret: pos } = stepNote(t, pos, n, { beats: 4, steps: 4 }))
		expect(line(t, 'lead')).toBe('lead | C4--- D4--- E4--- F4--- | G4--- .... .... .... |')
	})

	test('off the beat, it fills up to the beat', () => {
		const t = `${head}pattern A\nlead | .. |\nloop A`
		const r = stepNote(t, at(t, 9), 'A4', { beats: 4, steps: 4 })
		expect(line(r.text, 'lead')).toBe('lead | .. A4- .... .... .... |')
	})
})

describe('the visible piano and its chosen voice', () => {
	const text = 'key C\ntempo 120\nvoice pad pad\nvoice bass ebass\npattern A\npad | [C]--------------- |\nbass | _ |\nloop A'

	test('every visible key plays its labelled note in the chosen scale', () => {
		for (const name of ['C', 'Dm', 'F#']) {
			const key = parseKey(name)
			const keys = pianoKeys(3, key)
			expect(keys.filter((k) => !k.above)).toHaveLength(11)
			for (const k of keys) {
				expect(k.note).toBe(noteOf(k.code, 3, key))
				expect(k.note).not.toBeNull()
			}
		}
	})

	test('step entry writes the chosen bass, leaving the pad chord whole', () => {
		let out = { text, step: 0 }
		for (const note of ['C3', 'D3', 'E3', 'F3', 'G3']) {
			out = recordStep(out.text, { voice: 'bass', pattern: 'A', step: out.step, note })
			expect(line(out.text, 'pad')).toBe('pad | [C]--------------- |')
			expect(compile(out.text).errors).toEqual([])
		}
		expect(line(out.text, 'bass')).toBe('bass | G3--- D3--- E3--- F3--- |')
		expect(compile(out.text).loop.sections[0].bars).toBe(1)
	})

	test('live punch-in leaves every other voice unchanged', () => {
		const out = record(text, compile(text), { voice: 'bass', from: STEP * 2, to: STEP * 6, note: 'C3' })
		expect(line(out.text, 'pad')).toBe(line(text, 'pad'))
		expect(line(out.text, 'bass')).toBe('bass | .. C3--- .. .... .... |')
		expect(compile(out.text).errors).toEqual([])
	})

	test('punching an inherited bar adds a patch, never rewrites the source', () => {
		const t = text.replace('bass | _ |\nloop A', 'bass | C2--------------- |\npattern B from A\nloop A B')
		const out = record(t, compile(t), { voice: 'bass', from: 2 + 2 * STEP, to: 2 + 4 * STEP, note: 'D2' })
		expect(out.text).toContain('bass | C2--------------- |')
		expect(out.text).toContain('bass@1 | C2- D2- .... .... .... |')
		expect(line(out.text, 'pad')).toBe(line(t, 'pad'))
		expect(compile(out.text).errors).toEqual([])
	})

	test('extending a short inherited line leaves the source pattern alone', () => {
		const t = text.replace('pad | [C]--------------- |', 'pad | [C]--------------- | % |').replace('loop A', 'pattern B from A\nloop A B')
		const out = record(t, compile(t), { voice: 'bass', from: 6, to: 6 + STEP, note: 'D2' })
		expect(out.text).toContain('bass | _ |')
		expect(out.text).toContain('bass@2 | D2 ... .... .... .... |')
		expect(compile(out.text).errors).toEqual([])
	})
})
