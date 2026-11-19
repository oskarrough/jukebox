import { describe, expect, test } from 'bun:test'
import { EditorState } from '@codemirror/state'
import { keymap, runScopeHandlers } from '@codemirror/view'
import { editorKeymap, pageKeydown } from '../src/ui/shortcuts.js'

function event(key, modifiers = {}, typing = false) {
	return {
		key,
		keyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0,
		ctrlKey: false,
		metaKey: false,
		altKey: false,
		shiftKey: false,
		defaultPrevented: false,
		target: { closest: () => typing },
		preventDefault() {
			this.defaultPrevented = true
		},
		...modifiers,
	}
}

describe('browser shortcuts keep their defaults', () => {
	for (const modifier of ['ctrlKey', 'metaKey']) {
		for (const key of ['t', 'n', 'w', 'l', 'k', 'j', 's', 'd', 'u', '[', ']']) {
			test(`${modifier} + ${key}, on the page and in the score`, () => {
				const e = event(key, { [modifier]: true })
				const view = { state: EditorState.create({ doc: 'title A100', extensions: [keymap.of(editorKeymap)] }) }
				expect(runScopeHandlers(view, e, 'editor')).toBe(false)
				let played = false
				pageKeydown(e, () => (played = true))
				expect(e.defaultPrevented).toBe(false)
				expect(played).toBe(false)
			})
		}
	}
	test('reopen tab and developer tools', () => {
		const view = { state: EditorState.create({ extensions: [keymap.of(editorKeymap)] }) }
		for (const key of ['T', 'N', 'J', 'I', 'K']) {
			const e = event(key, { ctrlKey: true, shiftKey: true })
			expect(runScopeHandlers(view, e, 'editor')).toBe(false)
			pageKeydown(e, () => {
				throw new Error('Browser shortcut played the song')
			})
			expect(e.defaultPrevented).toBe(false)
		}
	})
})

test('play/stop still works with Mod-Enter and Space outside inputs', () => {
	for (const e of [event('Enter', { ctrlKey: true }), event('Enter', { metaKey: true }), event(' ')]) {
		let played = 0
		pageKeydown(e, () => played++)
		expect(played).toBe(1)
		expect(e.defaultPrevented).toBe(true)
	}
	for (const e of [
		event(' ', {}, true),
		event(' ', { ctrlKey: true }),
		event('Enter', { ctrlKey: true, shiftKey: true }),
		event('Enter', { ctrlKey: true, defaultPrevented: true }),
	]) {
		pageKeydown(e, () => {
			throw new Error('Unexpected playback')
		})
		expect(e.defaultPrevented).toBe(e.key === 'Enter' && !e.shiftKey)
	}
})

test('normal score editing and undo bindings remain available', () => {
	const keys = editorKeymap.map((b) => b.key)
	for (const key of ['Mod-a', 'Mod-z', 'Mod-y', 'ArrowLeft', 'Enter', 'Backspace']) expect(keys).toContain(key)
})
