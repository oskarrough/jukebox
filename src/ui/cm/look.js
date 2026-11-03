// How the score looks in CodeMirror: each voice in its roll colour, the bars,
// rests and comments as paint.js splits them; the beat ruler in the bar being
// written; numbers you can drag, drum steps as pads; the rest of the likeliest
// suggestion faint after the caret; and a line's mistake told at its end,
// with a red edge on the line.
import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view'
import { completionStatus, selectedCompletion } from '@codemirror/autocomplete'
import { forEachDiagnostic } from '@codemirror/lint'
import { paint } from '../paint.js'
import { ruler } from '../ruler.js'
import { suggest } from '../complete.js'
import { numbersIn } from './controls.js'

// What the score needs to know of the song: its voices' names, their
// colours, which are drums, and its key.
export const setInfo = StateEffect.define()
export const info = StateField.define({
	create: () => ({ names: [], colors: {}, drums: new Set(), key: null }),
	update: (v, tr) => tr.effects.find((e) => e.is(setInfo))?.value ?? v,
})

const MUSIC = /^\s*(\w+)(@\d+)?\s*\|/
const marks = new Map()
// One mark per look, made once: `cls`, and the voice colour `c`.
function markOf(cls, c, hit) {
	const id = `${cls}|${c ?? ''}|${hit ?? ''}`
	let m = marks.get(id)
	if (!m) {
		const attributes = {}
		if (c) attributes.style = `--c: ${c}`
		if (hit) attributes['data-hit'] = hit
		marks.set(id, (m = Decoration.mark({ class: cls, attributes })))
	}
	return m
}
const LINE = Decoration.line({ class: 'line' })
const HERE = Decoration.line({ class: 'line here' })

// The painted lines in view.
function paintView(view) {
	const { state } = view
	const { names, colors, drums } = state.field(info)
	const head = state.selection.main.head
	const caretLine = state.doc.lineAt(head).number
	const ruled = view.hasFocus && state.selection.main.empty ? ruler(state.doc.toString(), head) : null
	const out = []
	for (const { from, to } of view.visibleRanges) {
		for (let pos = from; pos <= to;) {
			const line = state.doc.lineAt(pos)
			const at = line.from
			out.push((line.number === caretLine ? HERE : LINE).range(at))
			const drum = drums.has(MUSIC.exec(line.text)?.[1])
			let col = 0
			for (const [kind, text, voice] of paint(line.text, names)) {
				const c = voice ? colors[voice] : null
				if (drum && col > line.text.indexOf('|') && (kind === 'note' || kind === 'rest')) {
					for (let i = 0; i < text.length; i++) out.push(markOf(`${kind} pad`, c, text[i]).range(at + col + i, at + col + i + 1))
				} else if (kind !== 'space') out.push(markOf(kind, c).range(at + col, at + col + text.length))
				col += text.length
			}
			for (const n of numbersIn(line.text)) out.push(markOf('num').range(at + n.start, at + n.end))
			if (ruled?.ln === line.number) for (const m of ruled.marks) out.push(markOf(m.cls).range(at + m.start, at + m.end))
			pos = line.to + 1
		}
	}
	return Decoration.set(out, true)
}

export const painted = ViewPlugin.fromClass(
	class {
		constructor(view) {
			this.decorations = paintView(view)
		}
		update(u) {
			if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged || u.startState.field(info) !== u.state.field(info))
				this.decorations = paintView(u.view)
		}
	},
	{ decorations: (v) => v.decorations },
)

// The rest of the likeliest suggestion at the caret, at the end of its line:
// { from, to, insert, rest }, the suggestion going in over from…to; or null.
export function ghostAt(state) {
	const sel = state.selection.main
	if (!sel.empty) return null
	const line = state.doc.lineAt(sel.head)
	if (line.text.slice(sel.head - line.from).trim()) return null
	const s = suggest(state.doc.toString(), sel.head, state.field(info).key ?? undefined)
	if (!s) return null
	const picked = completionStatus(state) === 'active' && selectedCompletion(state)
	const item = picked ? s.items.find((i) => i.word === picked.label) : s.free && !s.likely ? null : s.items[0]
	const rest = item?.insert.slice(s.end - s.start)
	return rest ? { from: s.start, to: s.end, insert: item.insert, rest } : null
}

class Ghost extends WidgetType {
	constructor(text) {
		super()
		this.text = text
	}
	eq(o) {
		return o.text === this.text
	}
	toDOM() {
		const el = document.createElement('span')
		el.className = 'ghost'
		el.textContent = this.text
		return el
	}
	ignoreEvent() {
		return false
	}
}

export const ghost = ViewPlugin.fromClass(
	class {
		constructor() {
			this.decorations = Decoration.none
		}
		update(u) {
			const g = u.view.hasFocus && u.state.field(info).key ? ghostAt(u.state) : null
			const at = u.state.selection.main.head
			this.decorations = g ? Decoration.set([Decoration.widget({ widget: new Ghost(g.rest), side: 1 }).range(at)]) : Decoration.none
		}
	},
	{ decorations: (v) => v.decorations },
)

// A line's mistake, told at its end: the first it can fix, else the first;
// a click on its fix puts it in. The line gets a red edge.
const WRONG = Decoration.line({ class: 'wrong' })
class Note extends WidgetType {
	constructor(d) {
		super()
		this.d = d
	}
	eq(o) {
		return o.d.message === this.d.message && o.d.actions?.[0]?.name === this.d.actions?.[0]?.name
	}
	toDOM(view) {
		const el = document.createElement('span')
		el.className = 'note-end'
		el.textContent = this.d.message
		const fix = this.d.actions?.[0]
		if (fix) {
			const ins = document.createElement('ins')
			ins.textContent = fix.name
			ins.title = `Write ${fix.name} here`
			ins.onmousedown = (e) => {
				e.preventDefault()
				let from = null
				forEachDiagnostic(view.state, (d, f) => {
					if (d === this.d) from = f
				})
				if (from != null) fix.apply(view, from, from)
			}
			el.append(ins)
		}
		return el
	}
	ignoreEvent() {
		return true
	}
}

export const notes = ViewPlugin.fromClass(
	class {
		constructor(view) {
			this.decorations = this.build(view.state)
		}
		update(u) {
			this.decorations = this.build(u.state)
		}
		build(state) {
			const told = new Map()
			forEachDiagnostic(state, (d, from) => {
				const ln = state.doc.lineAt(from).number
				const was = told.get(ln)
				if (!was || (!was.actions?.length && d.actions?.length)) told.set(ln, d)
			})
			const out = [...told].flatMap(([ln, d]) => {
				const line = state.doc.line(ln)
				return [WRONG.range(line.from), Decoration.widget({ widget: new Note(d), side: 2 }).range(line.to)]
			})
			return Decoration.set(out, true)
		}
	},
	{ decorations: (v) => v.decorations },
)
