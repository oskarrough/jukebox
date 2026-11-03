import { describe, expect, test } from 'bun:test'
import { compile } from '../src/score.js'
import { mistakes } from '../src/ui/lint.js'

const HEAD = 'beats 1\nvoice lead flute\nvoice kick kick\n'
const at = (text, now) => {
	const lines = text.split('\n')
	return [...mistakes(text, compile(text).errors, now)].map(([ln, [m]]) => ({
		ln,
		word: lines[ln - 1].slice(m.start, m.end),
		fix: m.fix?.label ?? null,
	}))
}
// The first mistake's message and, with its fix put in, the text.
const fixed = (text) => {
	const [[, [m]]] = mistakes(text, compile(text).errors)
	return { msg: m.msg, text: m.fix && text.slice(0, m.fix.start) + m.fix.to + text.slice(m.fix.end), tip: m.fix?.tip }
}

describe('errors at the error', () => {
	test('a slip in an instrument, option, setting or voice is fixed', () => {
		expect(at('beats 1\nvoice lead flte\npattern A\nlead | C4--- |')).toContainEqual({ ln: 2, word: 'flte', fix: 'flute' })
		expect(at('beats 1\nvoice lead flute vl=1\npattern A\nlead | C4--- |')).toEqual([{ ln: 2, word: 'vl', fix: 'vol' }])
		expect(at('tmepo 100\nbeats 1\nvoice lead flute\npattern A\nlead | C4--- |')).toEqual([{ ln: 1, word: 'tmepo', fix: 'tempo' }])
		expect(at(HEAD + 'pattern A\nleed | C4--- |\nkick | x... |')).toEqual([{ ln: 5, word: 'leed', fix: 'lead' }])
		expect(at(HEAD + 'pattern A\nlead | C4--- |\nloop B')).toEqual([{ ln: 6, word: 'B', fix: null }])
	})
	test('a wrong bar is underlined on its own', () => {
		const [m] = at(HEAD + 'pattern A\nlead | C4--- | C4-- |')
		expect(m).toEqual({ ln: 5, word: 'C4--', fix: 'C4-- .' })
		expect(at(HEAD + 'pattern A\nkick | x... | x..y |')[0].word).toBe('y')
	})
	test('a bar in a patch line is pointed at there', () => {
		const text = HEAD + 'beats 4\npattern A\nlead | C4--------------- | C4--------------- |\npattern B from A\nlead@2 | C4-------------- |'
		expect(at(text)).toEqual([{ ln: 8, word: 'C4--------------', fix: 'C4-------------- .' }])
	})
})

describe('errors speak composer', () => {
	test('an unknown word in a pattern is a voice to add', () => {
		const r = fixed(HEAD + 'pattern A\nlead | C4--- |\ntest')
		expect(r.msg).toBe('No voice called test')
		expect(r.tip).toBe('Add voice test')
		expect(r.text).toBe('beats 1\nvoice lead flute\nvoice kick kick\nvoice test rhodes\npattern A\nlead | C4--- |\ntest')
		expect(fixed(HEAD + 'pattern A\nbass | C2--- |').text).toContain('voice bass ebass\npattern A')
		expect(fixed(HEAD + 'pattern A\nhihat | x.x. |').text).toContain('voice hihat hat\n')
		expect(fixed('beats 1\npattern A\nlead | C4--- |').text).toBe('beats 1\nvoice lead square\npattern A\nlead | C4--- |')
	})
	test('a voice without bars gets its |', () => {
		expect(fixed(HEAD + 'pattern A\nlead C4---')).toMatchObject({ msg: 'Missing |', text: HEAD + 'pattern A\nlead | C4---' })
	})
	test('a bar too long or short says by how much, and becomes what plays', () => {
		expect(fixed(HEAD + 'pattern A\nlead | C4-- |')).toMatchObject({ msg: '3 steps, needs 4', text: HEAD + 'pattern A\nlead | C4-- . |' })
		expect(fixed(HEAD + 'pattern A\nlead | C4- D4--- |').text).toBe(HEAD + 'pattern A\nlead | C4- D4- |')
		expect(fixed(HEAD + 'pattern A\nkick | x.x |').text).toBe(HEAD + 'pattern A\nkick | x.x. |')
		expect(fixed(HEAD + 'pattern A\nkick | x.x.x |')).toMatchObject({ msg: '5 steps, needs 4', text: HEAD + 'pattern A\nkick | x.x. |' })
	})
	test('every kind of slip has a short message and, where obvious, a fix', () => {
		const cases = [
			['voice lead flute vol 0.5', 'Missing =', 'voice lead flute vol=0.5'],
			['voice lead flute pan:1', 'Missing =', 'voice lead flute pan=1'],
			['voice lead', 'No instrument', 'voice lead square'],
			['voice le-ad flute', 'Names use letters, digits and _', 'voice le_ad flute'],
			['voice lead flute center=E', 'Needs an octave, like C4', 'voice lead flute center=E4'],
			['key H', 'No key called H', 'key B'],
			['tempo 90\nvoice kick kick\nvoice kick hat', 'kick is already a voice', 'tempo 90\nvoice kick kick\nvoice kick2 hat'],
		]
		for (const [line, msg, to] of cases) {
			const text = `${line}\nbeats 1\npattern A\nkick | x... |`
			expect(fixed(text)).toMatchObject({ msg, text: `${to}\nbeats 1\npattern A\nkick | x... |` })
		}
		const music = [
			['lead | C4--- | | C4--- |', 'Empty bar', 'lead | C4--- | _ | C4--- |'],
			['lead | C D4- . |', 'Needs an octave, like C4', 'lead | C4 D4- . |'],
			['lead | [Cminor]--- |', 'No chord called Cminor', 'lead | [Cm]--- |'],
			['lead | Dm7--- |', 'No note called Dm7---', 'lead | [Dm7]--- |'],
			['lead@0 | C4--- |', 'Bars start at 1', 'lead@1 | C4--- |'],
			['kick | x0.. |', 'Steps are x X o .', 'kick | xo.. |'],
		]
		for (const [line, msg, to] of music) expect(fixed(`${HEAD}pattern A\n${line}`)).toMatchObject({ msg, text: `${HEAD}pattern A\n${to}` })
		expect(fixed(`${HEAD}pattern A\nlead | % |`).msg).toBe('No bar to repeat')
		expect(fixed(`${HEAD}pattern A\nlead | = |`).msg).toBe('No note to hold')
		expect(fixed(`${HEAD}pattern A\nlead | C4--- |\nloop Ax2`).text).toBe(`${HEAD}pattern A\nlead | C4--- |\nloop A*2`)
		expect(fixed(`${HEAD}pattern A\nlead | C4--- |\nloop A,`)).toMatchObject({
			msg: 'Like A, A*2 or A+5',
			text: `${HEAD}pattern A\nlead | C4--- |\nloop A`,
		})
		expect(fixed(`${HEAD}pattern A form B\nlead | C4--- |`)).toMatchObject({
			msg: 'No option called form',
			text: `${HEAD}pattern A from B\nlead | C4--- |`,
		})
		expect(fixed(`${HEAD}pattern A tempo 90\nlead | C4--- |`).text).toBe(`${HEAD}pattern A tempo=90\nlead | C4--- |`)
		expect(fixed(`${HEAD}pattern\nlead | C4--- |`)).toMatchObject({ msg: 'Needs a name', text: `${HEAD}pattern A\nlead | C4--- |` })
		expect(fixed(`${HEAD}lead | C4--- |`)).toMatchObject({ msg: 'No pattern above', text: `${HEAD}pattern A\nlead | C4--- |` })
		expect(fixed(`${HEAD}pattern A from Z\nlead | C4--- |`).msg).toBe('No pattern called Z')
		expect(fixed(`${HEAD}pattern A\nlead | C4--- |\npattern A\nlead | C4--- |`)).toMatchObject({ msg: 'A is already a pattern' })
	})
})

describe('errors wait while you write', () => {
	test('the line being typed on waits, then shows', () => {
		const text = HEAD + 'pattern A\nlead | C4--- |\ntest'
		expect(at(text, { caret: 6, typing: 6 })).toEqual([])
		expect(at(text, { caret: 6 })).toHaveLength(1)
	})
	test('a pattern being written waits for its music', () => {
		const text = HEAD + 'pattern A\nlead | C4--- |\npattern B\n'
		expect(at(text, { caret: 7 })).toEqual([])
		expect(at(text, { caret: 6 })).toEqual([])
		expect(at(text, { caret: 1 })).toEqual([{ ln: 6, word: 'B', fix: null }])
	})
	test('music waits for the voice line being typed', () => {
		const text = 'beats 1\nvoice le\npattern A\nlead | C4--- |'
		expect(at(text, { caret: 2, typing: 2 })).toEqual([])
		expect(at(text).map((m) => m.ln)).toEqual([2, 4])
	})
	test('an empty pattern whose music is all wrong only says what is', () => {
		expect(at('beats 1\npattern A\nlead | C4--- |').map((m) => m.ln)).toEqual([3])
	})
})
