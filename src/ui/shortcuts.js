import { defaultKeymap, historyKeymap } from '@codemirror/commands'
import { completionKeymap } from '@codemirror/autocomplete'

// Leave browser navigation, bookmarks, source and developer tools alone.
// Mod-Enter belongs to the page; Ctrl-Space belongs to its completion source.
const reserved = new Set(['Mod-Enter', 'Ctrl-Space', 'Mod-u', 'Mod-k', 'Shift-Mod-k', 'Mod-[', 'Mod-]'])
export const editorKeymap = [...completionKeymap, ...historyKeymap, ...defaultKeymap].filter((b) => !reserved.has(b.key))

export function pageKeydown(e, toggle) {
	if (e.defaultPrevented || e.altKey) return
	const mod = e.metaKey || e.ctrlKey
	const typing = e.target.closest?.('textarea, input, select, [contenteditable="true"]')
	if ((mod && !e.shiftKey && e.key === 'Enter') || (!mod && e.key === ' ' && !typing)) {
		e.preventDefault()
		toggle()
	}
}
