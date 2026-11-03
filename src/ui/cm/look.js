// How the score looks in CodeMirror: each voice in its roll colour, the bars,
// rests and comments as paint.js splits them; the beat ruler in the bar being
// written; numbers you can drag, drum steps as pads (class step); the rest of the likeliest
// suggestion faint after the caret; and a line's mistake told at its end,
// with a red edge on the line.
import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view'
import { completionStatus, selectedCompletion } from '@codemirror/autocomplete'
import { forEachDiagnostic } from '@codemirror/lint'
import { paint } from '../paint.js'
import { ruler } from '../ruler.js'
import { suggest } from '../complete.js'
import { numbersIn } from './controls.js'
import { inherited, repeats } from './meaning.js'

// What the score needs to know of the song: its voices' names, their
// colours, which are drums, and its key.
export const setInfo = StateEffect.define()
export const info = StateField.define({
	create: () => ({ names: [], colors: {}, drums: new Set(), insts: {}, muted: new Set(), fresh: null, key: null }),
	update: (v, tr) => tr.effects.find((e) => e.is(setInfo))?.value ?? v,
})

const MUSIC = /^\s*(\w+)(@\d+)?\s*\|/
const marks = new Map()
// One mark per look, made once: `cls`, the voice colour `c`, a drum step's
// `hit`, for a voice's name the voice and its place `i` in the song, and the
// width `w` in letters a line's label is drawn to, so every bar starts in one column.
function markOf(cls, c, hit, voice, i, w) {
	const id = `${cls}|${c ?? ''}|${hit ?? ''}|${voice ?? ''}|${i ?? ''}|${w ?? ''}`
	let m = marks.get(id)
	if (!m) {
		const attributes = { style: w ? `--w: ${w}` : '' }
		if (c) attributes.style += `; --c: ${c}`
		if (hit) attributes['data-hit'] = hit
		if (voice) {
			attributes['data-voice'] = voice
			attributes.style += `; --a: var(--a${i}, 0)`
		}
		marks.set(id, (m = Decoration.mark({ class: cls, attributes })))
	}
	return m
}
const LINE = Decoration.line({ class: 'line' })
const HERE = Decoration.line({ class: 'line here' })

// The painted lines in view.
function paintView(view) {
	const { state } = view
	const { names, colors, drums, muted, fresh } = state.field(info)
	const head = state.selection.main.head
	const caretLine = state.doc.lineAt(head).number
	const ruled = view.hasFocus && state.selection.main.empty ? ruler(state.doc.toString(), head) : null
	const w = Math.max(6, ...names.map((n) => n.length))
	const out = []
	for (const { from, to } of view.visibleRanges) {
		for (let pos = from; pos <= to;) {
			const line = state.doc.lineAt(pos)
			const at = line.from
			out.push((line.number === caretLine ? HERE : LINE).range(at))
			const drum = drums.has(MUSIC.exec(line.text)?.[1])
			let col = 0
			let label = false
			for (const [kind, text, voice] of paint(line.text, names)) {
				// the spaces after a label, however many were typed, take one letter
				if (label && kind === 'space') out.push(markOf('gap').range(at + col, at + col + text.length))
				label = kind === 'name' || (kind === 'word' && text === 'chords')
				const c = voice ? colors[voice] : null
				if (drum && col > line.text.indexOf('|') && (kind === 'note' || kind === 'rest')) {
					for (let i = 0; i < text.length; i++) out.push(markOf(`${kind} step`, c, text[i]).range(at + col + i, at + col + i + 1))
				} else if (kind === 'name' && c) {
					const cls = `name chip${muted.has(voice) ? ' off' : ''}${fresh === voice ? ' fresh' : ''}`
					out.push(markOf(`${cls} wide`, c, null, voice, names.indexOf(voice), w).range(at + col, at + col + text.length))
				} else if (kind === 'word' && text === 'chords' && col === line.text.indexOf('chords')) {
					out.push(markOf('word wide', null, null, null, null, w).range(at + col, at + col + text.length))
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
			// The menu covers the slot being written: its line's note waits.
			const open = completionStatus(state) === 'active' ? state.doc.lineAt(state.selection.main.head).number : 0
			const out = [...told]
				.filter(([ln]) => ln !== open)
				.flatMap(([ln, d]) => {
					const line = state.doc.line(ln)
					return [WRONG.range(line.from), Decoration.widget({ widget: new Note(d), side: 2 }).range(line.to)]
				})
			return Decoration.set(out, true)
		}
	},
	{ decorations: (v) => v.decorations },
)

// What the shorthand stands for, drawn over the text and never in it: a
// pattern built on another shows the lines it gets from it in faded ink
// under its own; a % is the bar before it, faint; a _ is an empty bar.
// A click on a faded line makes it a real one (Editor.jsx).
function pieces(line, names, colors, drum) {
	const out = []
	let col = 0
	const inBars = line.indexOf('|')
	for (const [kind, text, voice] of paint(line, names)) {
		const c = voice ? colors[voice] : null
		const one = (cls, t, at, hit) => {
			const el = document.createElement('span')
			el.className = cls
			el.textContent = t
			el.dataset.col = at
			if (c) el.style.setProperty('--c', c)
			if (hit) el.dataset.hit = hit
			out.push(el)
		}
		if (drum && col > inBars && (kind === 'note' || kind === 'rest')) {
			for (let i = 0; i < text.length; i++) one(`${kind} step`, text[i], col + i, text[i])
		} else one(kind, text, col)
		col += text.length
	}
	return out
}
class Inherited extends WidgetType {
	constructor(lines, names, colors, drums) {
		super()
		this.lines = lines
		this.names = names
		this.colors = colors
		this.drums = drums
	}
	eq(o) {
		return (
			JSON.stringify([o.lines, o.names, o.colors, [...o.drums]]) === JSON.stringify([this.lines, this.names, this.colors, [...this.drums]])
		)
	}
	toDOM() {
		const el = document.createElement('div')
		el.className = 'inherited'
		this.lines.forEach((l, i) => {
			const row = document.createElement('div')
			row.className = 'line'
			row.dataset.i = i
			row.append(...pieces(l.text, this.names, this.colors, this.drums.has(l.voice)))
			el.append(row)
		})
		return el
	}
	ignoreEvent() {
		return false
	}
}
// A % or _ bar, as the bar it means.
class Again extends WidgetType {
	constructor(r, color, drum) {
		super()
		this.r = r
		this.color = color
		this.drum = drum
	}
	eq(o) {
		return o.r.bar === this.r.bar && o.r.silent === this.r.silent && o.color === this.color && o.drum === this.drum
	}
	toDOM() {
		const el = document.createElement('span')
		el.className = `again${this.r.silent ? ' silent' : ''}`
		if (this.color) el.style.setProperty('--c', this.color)
		const bar = this.r.bar || '    '
		if (this.drum) {
			for (const ch of bar) {
				const s = document.createElement('span')
				s.className = 'step'
				s.dataset.hit = this.r.silent ? '.' : ch
				s.textContent = ch
				el.append(s)
			}
		} else {
			el.textContent = this.r.silent ? ' '.repeat(bar.length) : bar
		}
		return el
	}
}

function meant(state) {
	const text = state.doc.toString()
	const { names, colors, drums } = state.field(info)
	const out = []
	for (const b of inherited(text))
		out.push(Decoration.widget({ widget: new Inherited(b.lines, names, colors, drums), block: true, side: 1 }).range(b.at))
	for (const r of repeats(text))
		out.push(Decoration.replace({ widget: new Again(r, colors[r.voice], drums.has(r.voice)) }).range(r.from, r.to))
	return Decoration.set(out, true)
}
export const meaning = StateField.define({
	create: meant,
	update: (v, tr) => (tr.docChanged || tr.startState.field(info) !== tr.state.field(info) ? meant(tr.state) : v),
	provide: (f) => EditorView.decorations.from(f),
})
