// The score, in CodeMirror: the song's text, with live controls drawn from
// it. Each voice's name is its channel: it lights while the voice plays, a
// click mutes it, ⌥-click or a long press solos it, pointing at it plays it.
// Drag a number to change it as you hear it, click an instrument to swap
// it, tap a drum step's pad, click a chord to open the chord pad on its bar.
// ⌥↑/↓ or an ⌥-drag nudges the note, number or drum step there. Each writes
// text, so ⌘Z, saving and agents still work.
import { createEffect, createMemo, createSignal, onSettled, untrack } from 'solid-js'
import { Annotation, Compartment, EditorState, Transaction } from '@codemirror/state'
import { EditorView, closeHoverTooltips, hoverTooltip, keymap, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, isolateHistory } from '@codemirror/commands'
import {
	acceptCompletion,
	autocompletion,
	completionKeymap,
	completionStatus,
	currentCompletions,
	insertCompletionText,
	selectedCompletionIndex,
	setSelectedCompletion,
	moveCompletionSelection,
	selectedCompletion,
	startCompletion,
} from '@codemirror/autocomplete'
import { linter } from '@codemirror/lint'
import { jb, useEditor } from './state.js'
import { ChordLadder, holdChord } from './ChordPad.jsx'
import { caretAt } from './link.js'
import { nudge } from './nudge.js'
import { sample, suggest } from './complete.js'
import { mistakes } from './lint.js'
import { compile } from '../score.js'
import { inherited } from './cm/meaning.js'
import { drift, flip, hintAt, numbersIn, scrub } from './cm/controls.js'
import { ghost, ghostAt, info, meaning, notes, painted, setInfo } from './cm/look.js'
import './cm/cm.css'

// A caret put somewhere by the roll, not by hand.
const revealed = Annotation.define()
// A section's drag showing its arrangement, not an edit.
const previewed = Annotation.define()
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

	// ⌘D rolls the die on the voice of the line the caret is on.
	function rollHere(v) {
		const at = caretAt(v.state.doc.toString(), v.state.selection.main.head)
		if (!at.voice || at.voice === 'chords' || !at.pattern) return false
		jb.rollVoice(at.pattern, at.voice)
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

	// Words on what the pointer rests on; a die has its own.
	let onDie = false
	const hovers = hoverTooltip(
		(v, pos) => {
			if (onDie) return null
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
		onDie = !!e.target.closest?.('.die')
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

	// Drags a number right or up for more, a step of its last digit every few
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
			const to = scrub(was, drift(m.clientX - e.clientX, m.clientY - e.clientY), n.name)
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

	// A click on a line the pattern gets from the one it starts from makes it
	// a line of its own, solid, with the caret where you clicked; a drum step
	// flips as it does.
	function realize(v, e, row) {
		const block = row.closest('.inherited')
		const at = v.posAtDOM(block)
		const found = inherited(text()).find((b) => b.at === at)?.lines[row.dataset.i]
		if (!found) return false
		e.preventDefault()
		const hit = e.target.closest?.('[data-col]')
		const col = Number(hit?.dataset.col ?? found.text.length)
		const step = hit?.matches('.step')
		const line = step ? found.text.slice(0, col) + flip(found.text[col]) + found.text.slice(col + 1) : found.text
		v.focus()
		write(at, at, '\n' + line, at + 1 + col + (step ? 1 : 0))
		if (step && found.text[col] === '.') jb.audition(text(), found.voice, 'x')
		return true
	}

	function pointerDown(e, v) {
		const die = e.target.closest?.('.die')
		if (die) {
			if (e.button) return false
			e.preventDefault()
			const at = caretAt(text(), v.posAtDOM(die))
			if (at.pattern) jb.rollVoice(at.pattern, die.dataset.voice)
			return true
		}
		const chip = e.target.closest?.('.chip')
		if (chip) return channel(v, e, chip)
		const faded = e.target.closest?.('.inherited .line')
		if (faded && !e.button) return realize(v, e, faded)
		if (e.altKey && !e.button && !e.metaKey && !e.ctrlKey) return nudgeDrag(v, e)
		if (e.button || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return false
		const el = e.target.closest?.('.num, .step, .inst, .chord')
		if (!el) return false
		if (el.matches('.num')) return drag(v, e, el)
		const pos = v.posAtDOM(el)
		if (el.matches('.step')) {
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
		// A chord on the chord row: dragged up or down it climbs its ladder; a
		// click opens the chord pad on its bar.
		const t = text()
		const at = caretAt(t, pos)
		if (!/^\s*chords\b/.test(v.state.doc.lineAt(pos).text) || !at.pattern) return false
		const where = compile(t, at.pattern).loop.sections[0]?.where?.chords ?? []
		const bar = where.findIndex((w) => w.ln === at.ln && w.k === at.k)
		// The pad pushes the score down, so the caret goes on the chord now, not where the button comes up.
		e.preventDefault()
		v.focus()
		v.dispatch({ selection: { anchor: pos } })
		const box = el.getBoundingClientRect()
		holdChord(e, {
			pattern: at.pattern,
			bar: bar < 0 ? at.k : bar,
			x: box.left + box.width / 2,
			y: box.top + box.height / 2,
			click: () => jb.pickBar(at.pattern, bar < 0 ? at.k : bar),
		})
		return true
	}

	// The song hears the score a moment after you stop typing; the caret
	// lights its bar on the roll; moving through suggestions plays instruments.
	let picked = null
	let hush = false
	const listen = EditorView.updateListener.of((u) => {
		if (u.transactions.some((tr) => tr.annotation(previewed))) return
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
			if (c?.inst && !hush) {
				// The line as it would read with this instrument, so it's a voice to hear.
				const line = u.state.doc.lineAt(u.state.selection.main.head)
				const name = /^\s*voice\s+(\S+)/i.exec(line.text)?.[1] ?? 'v'
				const rest = /^\s*voice\s+\S+\s+\S+(\s.*)$/i.exec(line.text)?.[1] ?? ''
				const t = text()
				hear(t.slice(0, line.from) + `voice ${name} ${c.label}${rest}` + t.slice(line.to), name, c.label)
			}
		}
	})

	// Painted, the score shows pads, chips and controls; plain, only its text.
	const [plain, setPlain] = createSignal(localStorage.getItem('jukebox:plain') === '1')
	const look = new Compartment()
	const looks = () => (untrack(plain) ? [] : [painted, meaning, ghost, notes, hovers])
	function togglePlain() {
		const next = !plain()
		setPlain(next)
		localStorage.setItem('jukebox:plain', next ? '1' : '')
		view?.dispatch({ effects: look.reconfigure(next ? [] : [painted, meaning, ghost, notes, hovers]) })
	}

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
					{ key: 'Mod-d', run: rollHere, preventDefault: true },
					{ key: 'Alt-ArrowUp', run: nudging(1, false), shift: nudging(1, true) },
					{ key: 'Alt-ArrowDown', run: nudging(-1, false), shift: nudging(-1, true) },
				]),
				autocompletion({ override: [source], selectOnOpen: false, icons: false, defaultKeymap: false, interactionDelay: 0 }),
				keymap.of(
					[...completionKeymap.filter((b) => b.key !== 'Ctrl-Space'), ...historyKeymap, ...defaultKeymap].filter(
						(b) => !PAGE_KEYS.has(b.key),
					),
				),
				look.of(looks()),
				lint,
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
		// Pointing at a suggestion picks it, so it's the one lit, and an instrument plays.
		view.dom.addEventListener('mouseover', (e) => {
			const li = e.target.closest?.('.cm-tooltip-autocomplete li')
			if (!li) return
			const i = [...li.parentNode.children].filter((c) => c.tagName === 'LI').indexOf(li)
			if (i >= 0 && i !== selectedCompletionIndex(view.state)) view.dispatch({ effects: setSelectedCompletion(i) })
		})
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

	// A section held in the strip: the score reads as its arrangement would,
	// outside the undo history, until it's let go.
	let before = null
	createEffect(jb.preview, (t) => {
		if (!view || (t == null && before == null)) return
		if (before == null) before = text()
		const next = t ?? before
		if (t == null) before = null
		const now = text()
		let a = 0
		while (a < now.length && now[a] === next[a]) a++
		let z = 0
		while (z < now.length - a && z < next.length - a && now[now.length - 1 - z] === next[next.length - 1 - z]) z++
		view.dispatch({
			changes: { from: a, to: now.length - z, insert: next.slice(a, next.length - z) },
			annotations: [previewed.of(true), Transaction.addToHistory.of(false)],
		})
	})

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
			<div class={{ code: true, cm: true, piano: jb.piano(), plain: plain() }} ref={host}>
				<span class="k look-toggle">
					<button
						type="button"
						aria-pressed={String(plain())}
						title={plain() ? 'Show pads and controls in the score' : 'Show the score as plain text'}
						onClick={togglePlain}
					>
						{'{}'}
					</button>
				</span>
			</div>
			<ChordLadder />
		</section>
	)
}
