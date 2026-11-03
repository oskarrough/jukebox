// The score, in CodeMirror: the song's text, with live controls drawn from
// it. Each voice's name is its channel: it lights while the voice plays, a
// click mutes it, ⌥-click or a long press solos it, pointing at it plays it.
// Drag a number to change it as you hear it, click an instrument to swap
// it, tap a drum step's pad, click a chord to open the chord pad on its bar.
// ⌥↑/↓ or an ⌥-drag nudges the note, number or drum step there. With the
// piano on, the keyboard plays notes and writes them in: in time while the
// song plays, else at the caret. Each writes text, so ⌘Z, saving and agents
// still work.
import { createEffect, createMemo, flush, onSettled, untrack } from 'solid-js'
import { Annotation, EditorState, Prec, Transaction } from '@codemirror/state'
import { EditorView, closeHoverTooltips, hoverTooltip, keymap, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, isolateHistory, undo } from '@codemirror/commands'
import {
	acceptCompletion,
	autocompletion,
	completionKeymap,
	completionStatus,
	currentCompletions,
	insertCompletionText,
	moveCompletionSelection,
	selectedCompletion,
	startCompletion,
} from '@codemirror/autocomplete'
import { linter } from '@codemirror/lint'
import { jb, useEditor } from './state.js'
import { caretAt } from './link.js'
import { nudge } from './nudge.js'
import { sample, suggest } from './complete.js'
import { mistakes } from './lint.js'
import { OCTAVE_KEYS, noteOf, octaveAt } from './keyboard.js'
import { moment, record, sizeOf, stepNote } from './record.js'
import { compile, parse } from '../score.js'
import { flip, hintAt, numbersIn, scrub } from './cm/controls.js'
import { ghost, ghostAt, info, notes, painted, setInfo } from './cm/look.js'
import './cm/cm.css'

// A caret put somewhere by the roll, not by hand.
const revealed = Annotation.define()
const lineOf = (state) => state.doc.lineAt(state.selection.main.head).number
// The commands the page has on ⌘, which the score leaves alone.
const PAGE_KEYS = new Set(['Mod-Enter', 'Mod-l', 'Mod-k', 'Mod-j', 'Mod-s'])

export function Editor() {
	let host
	let view
	let typing = 0
	// The text last handed to the song, so it isn't put back.
	let sent = null
	let shown = null
	const song = createMemo(() => {
		const voices = jb.song()?.voices ?? []
		return {
			names: voices.map((v) => v.name),
			colors: Object.fromEntries(voices.map((v, i) => [v.name, jb.colors()[i]])),
			drums: new Set(voices.filter((v) => v.drum).map((v) => v.name)),
			insts: Object.fromEntries(voices.map((v) => [v.name, v.inst])),
			muted: new Set(voices.map((v) => v.name).filter(jb.isMuted)),
			fresh: jb.fresh(),
			key: jb.key(),
		}
	})
	const text = () => view.state.doc.toString()
	// Plays a note of `inst`, unless the song is playing.
	const hear = (score, voice, inst) => !jb.live() && jb.audition(score, voice, sample(inst, untrack(song).key))

	// Writes `insert` over from…to as an edit of its own, so ⌘Z undoes just it.
	function write(from, to, insert, caret) {
		view.dispatch({
			changes: { from, to, insert },
			selection: caret == null ? undefined : { anchor: caret },
			annotations: [isolateHistory.of('full'), Transaction.userEvent.of('input')],
		})
	}

	// Suggestions: what complete.js offers at the caret. ⌃Space asks for
	// every choice there; a click on an instrument for every instrument.
	let asked = false
	let swapping = null
	// The list just offered, when its first starts picked so Enter
	// takes it: when typing opened it, unless anything may go there.
	let preselect = null
	function source(ctx) {
		const all = asked
		const swap = swapping
		asked = false
		swapping = null
		preselect = null
		const t = ctx.state.doc.toString()
		const key = ctx.state.field(info).key
		const s = swap ? suggest(t.slice(0, swap.from) + t.slice(swap.to), swap.from, key, true) : suggest(t, ctx.pos, key, all)
		if (!s || s.quiet) return null
		const ranks = [...new Set(s.items.map((i) => i.group).filter(Boolean))]
		const result = {
			from: s.start,
			to: swap ? swap.to : s.end,
			filter: false,
			options: s.items.map((i) => {
				const insert = swap ? i.insert.trimEnd() : i.insert
				return {
					label: i.word,
					detail: i.hint,
					inst: i.inst,
					section: i.group ? { name: i.group, rank: ranks.indexOf(i.group) } : undefined,
					apply: (v, _c, from, to) => {
						v.dispatch(insertCompletionText(v.state, insert, from, to))
						if (!swap) queueMicrotask(() => startCompletion(v))
					},
				}
			}),
		}
		if ((!ctx.explicit || all) && !swap && !s.free) preselect = result.options
		return result
	}
	function ask(v) {
		asked = true
		return startCompletion(v)
	}
	// Tab takes the picked suggestion, else the first, else the ghost.
	function tab(v) {
		if (completionStatus(v.state) === 'active') {
			if (!selectedCompletion(v.state)) moveCompletionSelection(true)(v)
			return acceptCompletion(v)
		}
		const g = ghostAt(v.state)
		if (!g) return false
		v.dispatch(insertCompletionText(v.state, g.insert, g.from, g.to))
		queueMicrotask(() => startCompletion(v))
		return true
	}
	// Puts `next` in place of the score as one edit, and the caret at `caret`.
	function put(next, caret) {
		const t = text()
		let a = 0
		while (a < t.length && t[a] === next[a]) a++
		let z = 0
		while (z < t.length - a && z < next.length - a && t[t.length - 1 - z] === next[next.length - 1 - z]) z++
		write(a, t.length - z, next.slice(a, next.length - z), caret)
	}

	// ⌥↑/↓ nudges the note, number or drum step at the caret, and plays it.
	const nudging = (dir, big) => (v) => {
		const pos = v.state.selection.main.head
		const { drums, key } = v.state.field(info)
		const r = nudge(v.state.doc.toString(), pos, dir, big, drums, key)
		if (!r) return false
		write(r.start, r.end, r.to, Math.min(Math.max(pos, r.start), r.start + r.to.length))
		if (r.voice) jb.audition(text(), r.voice, r.to)
		return true
	}

	// The song's mistakes, a moment after you stop typing.
	const lint = linter(
		(v) => {
			const t = v.state.doc.toString()
			const r = t === untrack(jb.text) ? untrack(jb.parsed) : compile(t)
			if (r.empty) return []
			const head = v.state.selection.main.head
			const caret = v.hasFocus ? v.state.doc.lineAt(head).number : 0
			// A word still being written waits until it's finished.
			const typing = caret && /\w/.test(t[head - 1] ?? '') ? caret : 0
			const out = []
			for (const [ln, list] of mistakes(t, r.errors, { caret, typing })) {
				const line = v.state.doc.line(ln)
				for (const m of list) {
					const from = line.from + m.start
					const fix = m.fix
					out.push({
						from,
						to: Math.min(line.from + m.end, line.to),
						severity: 'error',
						message: m.msg,
						actions: fix
							? [
									{
										name: fix.label,
										apply: (v, at) => {
											const d = at - from
											write(fix.start + d, fix.end + d, fix.to, fix.caret + d)
										},
									},
								]
							: [],
					})
				}
			}
			return out
		},
		{
			delay: 400,
			// Leaving a line finishes its last word.
			needsRefresh: (u) => u.focusChanged || (u.selectionSet && lineOf(u.startState) !== lineOf(u.state)),
		},
	)

	// Words on what the pointer rests on.
	const hovers = hoverTooltip(
		(v, pos) => {
			const line = v.state.doc.lineAt(pos)
			const { names, drums, insts, muted } = v.state.field(info)
			const h = hintAt(line.text, pos - line.from, names, drums, { insts, muted })
			if (!h?.tip) return null
			return {
				pos: line.from + h.start,
				above: true,
				create: () => {
					const dom = document.createElement('div')
					dom.className = 'cm-tip'
					dom.textContent = h.tip
					return { dom }
				},
			}
		},
		{ hoverTime: 500 },
	)

	// Pointing at an instrument plays it.
	let resting = null
	let waiting = 0
	function rest(v, e) {
		const pos = v.posAtCoords({ x: e.clientX, y: e.clientY })
		const line = pos == null ? null : v.state.doc.lineAt(pos)
		const { names, drums, insts, muted } = v.state.field(info)
		const h = line && hintAt(line.text, pos - line.from, names, drums, { insts, muted })
		const id = h?.inst ? `${line.number}:${h.start}` : null
		if (id === resting) return
		resting = id
		clearTimeout(waiting)
		if (id) waiting = setTimeout(() => hear(text(), h.voice, h.inst), 200)
	}

	// Drags a number left or right, a step of its last digit every few
	// pixels; the song hears it as it goes, and the whole drag undoes as one.
	// A click without a drag just puts the caret there.
	function drag(v, e, el) {
		const from = v.posAtDOM(el)
		const line = v.state.doc.lineAt(from)
		const n = numbersIn(line.text).find((n) => line.from + n.start === from)
		if (!n) return false
		const was = v.state.sliceDoc(from, line.from + n.end)
		const voice = /^\s*voice\s+(\S+)\s+(\S+)/i.exec(line.text)
		let now = was
		let heard = 0
		e.preventDefault()
		const move = (m) => {
			const to = scrub(was, Math.round((m.clientX - e.clientX) / 6), n.name)
			if (to === now) return
			v.dispatch({ changes: { from, to: from + now.length, insert: to }, annotations: Transaction.addToHistory.of(false) })
			now = to
			document.body.classList.add('scrubbing')
			if (performance.now() - heard < 120) return
			heard = performance.now()
			if (jb.live()) jb.setText(text())
			else if (voice) hear(text(), voice[1], voice[2].toLowerCase())
		}
		const up = (u) => {
			removeEventListener('pointermove', move)
			removeEventListener('pointerup', up)
			document.body.classList.remove('scrubbing')
			if (now === was) {
				const pos = v.posAtCoords({ x: u.clientX, y: u.clientY })
				v.focus()
				if (pos != null) v.dispatch({ selection: { anchor: pos } })
				return
			}
			v.dispatch({ changes: { from, to: from + now.length, insert: was }, annotations: Transaction.addToHistory.of(false) })
			write(from, from + was.length, now, from + now.length)
		}
		addEventListener('pointermove', move)
		addEventListener('pointerup', up)
		return true
	}

	// ⌥-drag up or down: a nudge every few pixels.
	function nudgeDrag(v, e) {
		const pos = v.posAtCoords({ x: e.clientX, y: e.clientY })
		const { drums, key } = v.state.field(info)
		if (pos == null || !nudge(text(), pos, 1, false, drums, key)) return false
		e.preventDefault()
		v.focus()
		v.dispatch({ selection: { anchor: pos } })
		let done = 0
		const move = (m) => {
			const want = Math.trunc((e.clientY - m.clientY) / 8)
			while (done !== want) {
				const dir = want > done ? 1 : -1
				if (!nudging(dir, m.shiftKey)(v)) break
				done += dir
			}
		}
		const up = () => {
			removeEventListener('pointermove', move)
			removeEventListener('pointerup', up)
		}
		addEventListener('pointermove', move)
		addEventListener('pointerup', up)
		return true
	}

	// The piano: a key plays its note on the voice the caret is in. On a
	// melodic voice's line, while the song plays, what you play is recorded
	// in time when you let go; stopped, it's written in at the caret. Z and X
	// move an octave from the line's.
	let octave = null
	// Keys held down, by code: the note, its voice, and when in the song.
	const held = new Map()
	// The take being recorded: the score before it, as it was last written,
	// and the last note's moment, for a chord. Undone as one.
	let take = null
	createEffect(
		() => jb.piano(),
		() => {
			octave = null
			take = null
		},
	)
	createEffect(
		() => jb.live(),
		(on) => {
			if (on) return
			for (const code of [...held.keys()]) release(code)
			take = null
		},
	)
	function playKey(e) {
		const t = text()
		const pos = view.state.selection.main.head
		const key = untrack(song).key
		if (e.code in OCTAVE_KEYS) {
			octave = Math.max(0, Math.min(8, (octave ?? octaveAt(t, pos, key) ?? 4) + OCTAVE_KEYS[e.code]))
			return true
		}
		const note = noteOf(e.code, octave ?? octaveAt(t, pos, key) ?? 4, key)
		if (!note) return false
		if (e.repeat) return true
		const at = caretAt(t, pos)
		const voices = parse(t).song.voices
		const voice = voices.find((v) => v.name === at.voice) ?? voices.find((v) => !v.drum)
		if (!voice) return true
		jb.audition(t, voice.name, voice.drum ? 'x' : note)
		if (voice.drum || at.voice !== voice.name) return true
		if (jb.live()) {
			held.set(e.code, { note, voice: voice.name, from: jb.elapsed() })
			return true
		}
		const whole = jb.whole() ?? jb.song()
		const r = stepNote(t, pos, note, whole ? sizeOf(whole, at.pattern) : { beats: 4, steps: 4 })
		if (r) put(r.text, r.caret)
		return true
	}
	// Writes the held key `code` into the take, as long as it was held.
	function release(code) {
		const h = held.get(code)
		held.delete(code)
		const playing = jb.nowPlaying()
		const m = h && playing && moment(playing, h.from)
		if (!m) return
		const to = jb.live() ? jb.elapsed() : h.from
		const id = `${m.s.name}:${m.s.start}:${m.step}`
		const chord = take?.id === id && Math.abs(h.from - take.from) < m.stepDur
		const r = record(text(), playing, { voice: h.voice, from: h.from, to, note: h.note, chord })
		if (!r) return
		// The caret stays where it was, a line down if one went in above it.
		const before = text().slice(0, view.state.selection.main.head).split('\n')
		const ln = before.length + (r.added && r.added <= before.length ? 1 : 0)
		const lines = r.text.split('\n')
		const caret = lines.slice(0, ln - 1).join('\n').length + (ln > 1 ? 1 : 0) + Math.min(before.at(-1).length, lines[ln - 1].length)
		// The take so far comes out and goes back in with this note, so ⌘Z undoes it whole.
		if (take?.last === text()) undo(view)
		if (take?.base !== text()) take = { base: text() }
		put(r.text, caret)
		Object.assign(take, { last: text(), id, from: h.from })
		clearTimeout(typing)
		sent = text()
		jb.setText(sent)
		flush()
	}
	const piano = Prec.highest(
		EditorView.domEventHandlers({
			keydown: (e) => {
				if (!jb.piano() || e.metaKey || e.ctrlKey || e.altKey || !playKey(e)) return false
				e.preventDefault()
				return true
			},
			keyup: (e) => void (held.has(e.code) && release(e.code)),
			blur: () => {
				for (const code of [...held.keys()]) release(code)
			},
		}),
	)

	// A voice's name: a click mutes it, ⌥-click solos it. A finger has no ⌥:
	// holding solos, and the lift that follows isn't a tap.
	function channel(v, e, el) {
		if (e.button || e.metaKey || e.ctrlKey || e.shiftKey) return false
		const voice = el.dataset.voice
		e.preventDefault()
		v.dispatch({ effects: closeHoverTooltips })
		if (e.pointerType !== 'touch') {
			jb.toggleVoice(voice, e.altKey)
			return true
		}
		let soloed = false
		const timer = setTimeout(() => {
			soloed = true
			navigator.vibrate?.(10)
			jb.toggleVoice(voice, true)
		}, 450)
		const up = (u) => {
			clearTimeout(timer)
			removeEventListener('pointerup', up)
			removeEventListener('pointercancel', up)
			if (!soloed && u.type === 'pointerup') jb.toggleVoice(voice, false)
		}
		addEventListener('pointerup', up)
		addEventListener('pointercancel', up)
		return true
	}

	function pointerDown(e, v) {
		const chip = e.target.closest?.('.chip')
		if (chip) return channel(v, e, chip)
		if (e.altKey && !e.button && !e.metaKey && !e.ctrlKey) return nudgeDrag(v, e)
		if (e.button || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return false
		const el = e.target.closest?.('.num, .pad, .inst, .chord')
		if (!el) return false
		if (el.matches('.num')) return drag(v, e, el)
		const pos = v.posAtDOM(el)
		if (el.matches('.pad')) {
			e.preventDefault()
			v.focus()
			const step = v.state.sliceDoc(pos, pos + 1)
			// The caret goes to the step first, so ⌘Z brings it back here too.
			v.dispatch({ selection: { anchor: pos } })
			write(pos, pos + 1, flip(step), pos + 1)
			const voice = caretAt(text(), pos).voice
			if (step === '.') jb.audition(text(), voice, 'x')
			return true
		}
		if (el.matches('.inst')) {
			e.preventDefault()
			const end = pos + el.textContent.length
			v.focus()
			v.dispatch({ selection: { anchor: end } })
			swapping = { from: pos, to: end }
			startCompletion(v)
			return true
		}
		// A chord on the chord row: the chord pad opens on its bar.
		const t = text()
		const at = caretAt(t, pos)
		if (!/^\s*chords\b/.test(v.state.doc.lineAt(pos).text) || !at.pattern) return false
		const where = compile(t, at.pattern).loop.sections[0]?.where?.chords ?? []
		const bar = where.findIndex((w) => w.ln === at.ln && w.k === at.k)
		// The pad pushes the score down, so the caret goes on the chord now, not where the button comes up.
		e.preventDefault()
		v.focus()
		v.dispatch({ selection: { anchor: pos } })
		jb.pickBar(at.pattern, bar < 0 ? at.k : bar)
		return true
	}

	// The song hears the score a moment after you stop typing; the caret
	// lights its bar on the roll; moving through suggestions plays instruments.
	let picked = null
	let hush = false
	const listen = EditorView.updateListener.of((u) => {
		if (u.docChanged) {
			const t = u.state.doc.toString()
			const outside = u.transactions.some((tr) => tr.annotation(isolateHistory))
			clearTimeout(typing)
			typing = setTimeout(
				() => {
					sent = t
					jb.setText(t)
				},
				outside ? 0 : 300,
			)
		}
		if (u.docChanged || u.selectionSet) {
			const byHand = !u.transactions.some((tr) => tr.annotation(revealed))
			jb.follow(caretAt(u.state.doc.toString(), u.state.selection.main.head), byHand)
		}
		const active = completionStatus(u.state) === 'active'
		const c = active ? selectedCompletion(u.state) : null
		if (active && !c && preselect?.includes(currentCompletions(u.state)[0])) {
			preselect = null
			queueMicrotask(() => {
				hush = true
				moveCompletionSelection(true)(u.view)
				hush = false
			})
		}
		if (c !== picked) {
			picked = c
			const line = u.state.doc.lineAt(u.state.selection.main.head).text
			if (c?.inst && !hush) hear(text(), /^\s*voice\s+(\S+)/i.exec(line)?.[1] ?? 'v', c.label)
		}
	})

	function stateOf(doc) {
		return EditorState.create({
			doc,
			extensions: [
				info.init(() => untrack(song)),
				drawSelection(),
				history(),
				EditorView.lineWrapping,
				keymap.of([
					{ key: 'Tab', run: tab },
					{ key: 'Ctrl-Space', run: ask },
					{ key: 'Alt-ArrowUp', run: nudging(1, false), shift: nudging(1, true) },
					{ key: 'Alt-ArrowDown', run: nudging(-1, false), shift: nudging(-1, true) },
				]),
				autocompletion({ override: [source], selectOnOpen: false, icons: false, defaultKeymap: false, interactionDelay: 0 }),
				keymap.of(
					[...completionKeymap.filter((b) => b.key !== 'Ctrl-Space'), ...historyKeymap, ...defaultKeymap].filter(
						(b) => !PAGE_KEYS.has(b.key),
					),
				),
				piano,
				painted,
				ghost,
				lint,
				notes,
				hovers,
				listen,
				EditorView.contentAttributes.of({ 'aria-label': 'Score', spellcheck: 'false' }),
				EditorView.domEventHandlers({
					pointerdown: pointerDown,
					pointermove: (e, v) => !e.buttons && rest(v, e),
					contextmenu: (e) => !!e.target.closest?.('.chip') && e.pointerType === 'touch' && (e.preventDefault(), true),
					pointerleave: () => {
						clearTimeout(waiting)
						resting = null
					},
					// Space types a space here, rather than playing.
					keydown: (e) => void (e.key === ' ' && e.stopPropagation()),
				}),
			],
		})
	}

	onSettled(() => {
		shown = untrack(jb.name)
		view = new EditorView({ parent: host, state: stateOf(untrack(jb.text)) })
		useEditor({
			value: text,
			replace: (from, to, insert) => write(from, to, insert),
			focus: (end) => {
				view.focus()
				if (end) view.dispatch({ selection: { anchor: view.state.doc.length } })
			},
		})
		return () => {
			clearTimeout(typing)
			useEditor(null)
			view.destroy()
		}
	})

	createEffect(song, (s) => view?.dispatch({ effects: setInfo.of(s) }))
	// How loud each voice is right now lights its name, without redrawing the score.
	createEffect(jb.levels, (levels) => levels.forEach((l, i) => host?.style.setProperty(`--a${i}`, l.toFixed(2))))

	// Another song gets a score of its own, with its own undo; the same song
	// changed elsewhere (saved, discarded, undone) takes the change as an edit.
	createEffect(
		() => [jb.name(), jb.text()],
		([name, t]) => {
			if (!view) return
			if (name !== shown) {
				shown = name
				sent = null
				clearTimeout(typing)
				view.setState(stateOf(t))
				view.scrollDOM.scrollTop = 0
				return
			}
			const now = text()
			if (t === now || t === sent) return
			let a = 0
			while (a < now.length && now[a] === t[a]) a++
			let z = 0
			while (z < now.length - a && z < t.length - a && now[now.length - 1 - z] === t[t.length - 1 - z]) z++
			write(a, now.length - z, t.slice(a, t.length - z))
		},
	)

	// The roll asked for a line: the caret goes there, and into view.
	createEffect(
		() => jb.wanted(),
		(want) => {
			if (!want || !view) return
			const doc = view.state.doc
			const line = doc.line(Math.min(want.ln, doc.lines))
			const pos = Math.min(line.from + want.col, line.to)
			view.focus()
			view.dispatch({
				selection: { anchor: pos },
				effects: EditorView.scrollIntoView(pos, { y: 'nearest', yMargin: 80 }),
				annotations: revealed.of(true),
			})
		},
	)

	return (
		<section class="editor">
			<div class={{ code: true, cm: true, piano: jb.piano() }} ref={host} />
		</section>
	)
}
