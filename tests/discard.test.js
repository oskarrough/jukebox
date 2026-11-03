import { describe, expect, test } from 'bun:test'
import { fate, neighbour, reinsert } from '../src/ui/discard.js'

describe('what the × does', () => {
	test('a song never saved is forgotten, saved or not', () => {
		expect(fate({ made: true, unsaved: true, canDelete: false })).toBe('forget')
	})
	test('edits are dropped first, then the file goes', () => {
		expect(fate({ made: false, unsaved: true, canDelete: true })).toBe('revert')
		expect(fate({ made: false, unsaved: false, canDelete: true })).toBe('delete')
	})
	test('a saved song stays on the built site', () => {
		expect(fate({ made: false, unsaved: false, canDelete: false })).toBeNull()
		expect(fate({ made: false, unsaved: true, canDelete: false })).toBe('revert')
	})
})

describe('the song that opens next', () => {
	test('the one after, else the one before, else none', () => {
		expect(neighbour(['a', 'b', 'c'], 'b')).toBe('c')
		expect(neighbour(['a', 'b', 'c'], 'c')).toBe('b')
		expect(neighbour(['a'], 'a')).toBeNull()
	})
})

describe('bringing a file back', () => {
	test('it returns to its place in the list', () => {
		const out = reinsert({ a: '1', c: '3' }, 'b', '2', ['a', 'b', 'c'])
		expect(Object.keys(out)).toEqual(['a', 'b', 'c'])
		expect(out.b).toBe('2')
	})
	test('songs added meanwhile follow', () => {
		const out = reinsert({ a: '1', z: '9' }, 'b', '2', ['a', 'b', 'c'])
		expect(Object.keys(out)).toEqual(['a', 'b', 'z'])
	})
})
