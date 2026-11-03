import { describe, expect, test } from 'bun:test'
import { compile } from '../src/score.js'
import { mistakes } from '../src/ui/lint.js'

const HEAD = 'beats 1\nvoice lead flute\nvoice kick kick\n'
const at = (text) => {
	const lines = text.split('\n')
	return [...mistakes(text, compile(text).errors)].map(([ln, [m]]) => ({ ln, word: lines[ln - 1].slice(m.start, m.end), fix: m.fix }))
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
		expect(m).toEqual({ ln: 5, word: 'C4--', fix: null })
		expect(at(HEAD + 'pattern A\nkick | x... | x..y |')[0].word).toBe('y')
	})
})
