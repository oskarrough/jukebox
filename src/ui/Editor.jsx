// The score. You type into a see-through textarea; behind it, a painted copy
// of the text shows each voice in its roll colour, the bars, rests and
// comments, and a line number level with each line however many rows it wraps
// to. A wrong word gets a red wavy line and its line a red number and a note
// at its end, once you've left the line; a click on the note fixes it. It replays a moment after you
// stop typing. Where the caret is lights its bar on the roll; a note clicked
// on the roll puts the caret on it. ⌥↑/↓ or an ⌥-drag nudges the note, number
// or drum step there; on a drum line, pads under the score switch its steps
// on and off. While you type, what could come next is suggested, the likeliest
// faint after the caret; pointing at an instrument plays it, at an option says
// what it does. In a bar, a tick shows where each beat starts and the bar's
// closing | turns warm when it holds too few or too many steps. With the piano on, the keyboard plays notes and writes them in:
// in time while the song plays, else at the caret.
import { For, createEffect, createMemo, createSignal, flush, onSettled } from 'solid-js'
import { jb } from './state.js'
import { barAt, caretAt } from './link.js'
import { nudge, stepsOf, toggleStep } from './nudge.js'
import { sample, suggest } from './complete.js'
import { mistakes } from './lint.js'
import { DRUM_STEPS, HINTS, chordNotes } from './hints.js'
import { OCTAVE_KEYS, noteOf, octaveAt } from './keyboard.js'
import { moment, record, sizeOf, stepNote } from './record.js'
import { mark, paint } from './paint.js'
import { ruler } from './ruler.js'
import { parse } from '../score.js'

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export function Editor() {
	let area
	let sheet
	let list
	let tip
	let typing = 0
	// What's in the box right now, ahead of the song while you type.
	const [draft, setDraft] = createSignal(() => jb.text())
	const settled = () => draft() === jb.text()
	// A song with nothing in it yet isn't wrong, just empty.
	const errors = () => (settled() && !jb.parsed().empty ? jb.parsed().errors : [])
	// The line the caret is on, and the one you're typing on: what's wrong
	// there waits until you leave it or stop for a while.
	const [caretLn, setCaretLn] = createSignal(0)
	const [typingLn, setTypingLn] = createSignal(0)
	// Where the caret is in the box, for the beat ruler.
	const [caretPos, setCaretPos] = createSignal(-1)
	const ruled = createMemo(() => (caretPos() < 0 ? null : ruler(draft(), caretPos())))
	let typingAt = 0
	let idle = 0
	const typed = (ln) => {
		typingAt = ln
		setTypingLn(ln)
		clearTimeout(idle)
		if (ln) idle = setTimeout(() => typed(0), 4000)
	}
	const wrong = createMemo(() => mistakes(jb.text(), errors(), { caret: caretLn(), typing: typingLn() }))
	// The one a line's note tells of: the first it can fix, else the first.
	const told = (ln) =>
		wrong()
			.get(ln)
			?.find((m) => m.fix) ?? wrong().get(ln)?.[0]
	const lines = createMemo(() => draft().split('\n'))
	const [width, setWidth] = createSignal(0)
	// Each voice's roll colour, by name.
	const colors = createMemo(() => {
		const voices = jb.song()?.voices ?? []
		return Object.fromEntries(voices.map((v, i) => [v.name, jb.colors()[i]]))
	})
	const names = createMemo(() => Object.keys(colors()))
	const drums = createMemo(() => new Set((jb.song()?.voices ?? []).filter((v) => v.drum).map((v) => v.name)))

	onSettled(() => {
		const measure = new ResizeObserver(() => {
			const pad = parseFloat(getComputedStyle(area).paddingLeft) * 2
			setWidth(area.clientWidth - pad)
		})
		measure.observe(area)
		return () => measure.disconnect()
	})

	// You moved the caret.
	const moved = () => {
		const at = caretAt(area.value, area.selectionStart)
		setCaretLn(at.ln)
		setCaretPos(area.selectionStart)
		if (at.ln !== typingAt) typed(0)
		jb.follow(at, true)
		if (!open()) offer(false)
	}
	// Where line `ln` starts in the text.
	const startOf = (ln) =>
		area.value
			.split('\n')
			.slice(0, ln - 1)
			.join('\n').length + (ln > 1 ? 1 : 0)

	// Puts `to` in place of start…end the way typing would, so ⌘Z undoes it,
	// and leaves the caret at `caret`.
	let writing = false
	function write(start, end, to, caret) {
		area.focus({ preventScroll: true })
		area.setSelectionRange(start, end)
		writing = true
		document.execCommand('insertText', false, to)
		writing = false
		area.setSelectionRange(caret, caret)
		moved()
	}

	// What's suggested at the caret: the words, which one is picked, and the
	// line `ln` and column `col` where the word being written starts. As you
	// type, a menu opens under that word; at the end of a line the picked one
	// also shows faint after the caret. A caret moved without typing only gets
	// quiet ones, which have no menu.
	const [hint, setHint] = createSignal(null)
	const open = () => !!hint() && !hint().quiet
	function offer(open) {
		const pos = area.selectionStart
		const s = area.selectionEnd === pos && suggest(area.value, pos, jb.key())
		if (!s || (!open && !s.quiet)) return setHint(null)
		const before = area.value.slice(0, s.start)
		const after = area.value.slice(pos).split('\n')[0]
		setHint({ ...s, i: 0, ln: before.split('\n').length, col: s.start - before.lastIndexOf('\n') - 1, atEnd: !after.trim() })
	}
	const ghost = createMemo(() => {
		const h = hint()
		const text = h?.atEnd && h.items[h.i].insert.slice(h.end - h.start)
		return text ? { ln: h.ln, col: h.col + h.end - h.start, text } : null
	})
	function pick(i) {
		const h = hint()
		setHint({ ...h, i })
		if (h.items[i].inst) hear(h.items[i].word)
	}
	function accept(item) {
		const h = hint()
		setHint(null)
		write(h.start, h.end, item.insert, h.start + item.insert.length)
		offer(true)
	}
	// Plays a note of `inst`, unless the song is playing.
	function hear(inst) {
		if (!jb.live()) jb.audition(`voice v ${inst}`, 'v', sample(inst, jb.key()))
	}

	// A click on a line's note puts its fix in.
	function fix(ln) {
		const { start, end, to, caret } = told(ln).fix
		write(start, end, to, caret)
	}

	// What the pointer is over in the painted copy, found as posAt does: a
	// note, a wrong word, an instrument, or something with a few words on it.
	// `start` is where to point the words from.
	function whatAt(x, y) {
		area.style.pointerEvents = 'none'
		sheet.style.pointerEvents = 'auto'
		const el = document.elementFromPoint(x, y)
		area.style.pointerEvents = sheet.style.pointerEvents = ''
		const row = el?.closest('.row')
		if (!row || !sheet.contains(row)) return null
		const ln = [...sheet.children].indexOf(row) + 1
		if (el.closest('.msg')) {
			const m = told(ln)
			return m && { ln, note: true, fix: m.fix, tip: m.fix?.tip ?? m.msg }
		}
		if (el.dataset.col == null) return null
		const col = +el.dataset.col
		const line = lines()[ln - 1]
		const m = wrong()
			.get(ln)
			?.find((m) => m.start <= col && col < m.end)
		if (m) return { ln, start: m.start, tip: m.msg }
		const kind = el.classList[0]
		if (kind === 'inst') return { ln, start: col, voice: /^\s*voice\s+(\S+)/i.exec(line)[1], inst: el.textContent.toLowerCase() }
		const music = /^\s*(\w+)(@\d+)?\s*\|/.exec(line)
		if (music) {
			if (kind === 'chord') {
				const tip = chordNotes(el.textContent)
				return tip && { ln, start: col, tip }
			}
			if (!drums().has(music[1]) || (kind !== 'note' && kind !== 'rest')) return null
			const bar = barAt(line, line.slice(0, col).split('|').length - 2)
			return bar && { ln, start: bar.start + bar.text.search(/\S|$/), tip: DRUM_STEPS }
		}
		const head = /\S*$/.exec(line.slice(0, col))[0]
		const name = /^\w+/.exec(head + /^\S*/.exec(line.slice(col))[0])?.[0].toLowerCase()
		return Object.hasOwn(HINTS, name) && kind !== 'name' ? { ln, start: col - head.length, tip: HINTS[name] } : null
	}
	// Once the pointer rests on something: its words show, or its instrument plays.
	const [hover, setHover] = createSignal(null)
	const [pointing, setPointing] = createSignal(false)
	let resting = null
	let waiting = 0
	let frame = 0
	function rest(x, y) {
		const at = whatAt(x, y)
		setPointing(!!at?.fix)
		const id = at && `${at.ln}:${at.start}:${at.tip ?? at.inst}`
		if (id === resting) return
		resting = id
		clearTimeout(waiting)
		setHover(null)
		if (!at) return
		waiting = setTimeout(
			() => {
				if (!at.inst) setHover(at)
				else if (!jb.live()) jb.audition(area.value, at.voice, sample(at.inst, jb.key()))
			},
			at.inst ? 200 : 500,
		)
	}
	function unrest() {
		cancelAnimationFrame(frame)
		clearTimeout(waiting)
		resting = null
		setHover(null)
		setPointing(false)
	}
	function shown(el, on) {
		if (el.matches(':popover-open') !== on) el.togglePopover(on)
	}
	createEffect(open, (on) => shown(list, on))
	createEffect(
		() => !!hover(),
		(on) => shown(tip, on),
	)

	// Puts `next` in place of the score as one edit, and the caret at `caret`.
	function put(next, caret) {
		const t = area.value
		let a = 0
		while (a < t.length && t[a] === next[a]) a++
		let z = 0
		while (z < t.length - a && z < next.length - a && t[t.length - 1 - z] === next[next.length - 1 - z]) z++
		write(a, t.length - z, next.slice(a, next.length - z), caret)
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
		const pos = area.selectionStart
		if (e.code in OCTAVE_KEYS) {
			octave = Math.max(0, Math.min(8, (octave ?? octaveAt(area.value, pos, jb.key()) ?? 4) + OCTAVE_KEYS[e.code]))
			return true
		}
		const note = noteOf(e.code, octave ?? octaveAt(area.value, pos, jb.key()) ?? 4, jb.key())
		if (!note) return false
		if (e.repeat) return true
		const at = caretAt(area.value, pos)
		const voices = parse(area.value).song.voices
		const voice = voices.find((v) => v.name === at.voice) ?? voices.find((v) => !v.drum)
		if (!voice) return true
		jb.audition(area.value, voice.name, voice.drum ? 'x' : note)
		if (voice.drum || at.voice !== voice.name) return true
		if (jb.live()) {
			held.set(e.code, { note, voice: voice.name, from: jb.elapsed() })
			return true
		}
		const song = jb.whole() ?? jb.song()
		const r = stepNote(area.value, pos, note, song ? sizeOf(song, at.pattern) : { beats: 4, steps: 4 })
		if (r) put(r.text, r.caret)
		return true
	}
	// Writes the held key `code` into the take, as long as it was held.
	function release(code) {
		const h = held.get(code)
		held.delete(code)
		const song = jb.nowPlaying()
		const m = h && song && moment(song, h.from)
		if (!m) return
		const to = jb.live() ? jb.elapsed() : h.from
		const id = `${m.s.name}:${m.s.start}:${m.step}`
		const chord = take?.id === id && Math.abs(h.from - take.from) < m.stepDur
		const r = record(area.value, song, { voice: h.voice, from: h.from, to, note: h.note, chord })
		if (!r) return
		// The caret stays where it was, a line down if one went in above it.
		const before = area.value.slice(0, area.selectionStart).split('\n')
		const ln = before.length + (r.added && r.added <= before.length ? 1 : 0)
		const lines = r.text.split('\n')
		const caret = lines.slice(0, ln - 1).join('\n').length + (ln > 1 ? 1 : 0) + Math.min(before.at(-1).length, lines[ln - 1].length)
		// The take so far comes out and goes back in with this note, so ⌘Z undoes it whole.
		if (take?.last === area.value) {
			writing = true
			document.execCommand('undo')
			writing = false
		}
		if (take?.base !== area.value) take = { base: area.value }
		put(r.text, caret)
		Object.assign(take, { last: area.value, id, from: h.from })
		clearTimeout(typing)
		jb.setText(area.value)
		flush()
	}

	// Nudges what's at `pos` by `dir`, and plays it. Whether there was anything to nudge.
	function nudgeAt(pos, dir, big) {
		const r = nudge(area.value, pos, dir, big, drums(), jb.key())
		if (!r) return false
		write(r.start, r.end, r.to, Math.min(Math.max(pos, r.start), r.start + r.to.length))
		if (r.voice) jb.audition(area.value, r.voice, r.to)
		return true
	}

	// The position in the text under a point on the screen, from the painted
	// copy, since a textarea can't say.
	function posAt(x, y) {
		area.style.pointerEvents = 'none'
		sheet.style.pointerEvents = sheet.style.userSelect = 'auto'
		const hit = document.caretPositionFromPoint?.(x, y)
		const node = hit?.offsetNode ?? document.caretRangeFromPoint?.(x, y)?.startContainer
		const offset = hit?.offset ?? document.caretRangeFromPoint?.(x, y)?.startOffset
		area.style.pointerEvents = sheet.style.pointerEvents = sheet.style.userSelect = ''
		const line = node?.parentElement?.closest('.line')
		if (!line) return null
		const range = document.createRange()
		range.setStart(line, 0)
		range.setEnd(node, offset)
		const ln = [...sheet.querySelectorAll('.line')].indexOf(line)
		const before = area.value.split('\n').slice(0, ln)
		return before.join('\n').length + (ln ? 1 : 0) + Math.min(range.toString().length, area.value.split('\n')[ln].length)
	}

	function keyDown(e) {
		const h = hint()
		if (h) {
			const move = !h.quiet && { ArrowDown: 1, ArrowUp: -1 }[e.key]
			if (move) {
				e.preventDefault()
				pick((h.i + move + h.items.length) % h.items.length)
				return
			}
			if (e.key === 'Tab' || (e.key === 'Enter' && !h.quiet)) {
				e.preventDefault()
				accept(h.items[h.i])
				return
			}
			setHint(null)
			if (e.key === 'Escape') return
		}
		if (jb.piano() && !e.metaKey && !e.ctrlKey && !e.altKey && playKey(e)) {
			e.preventDefault()
			return
		}
		if (!e.altKey || e.metaKey || e.ctrlKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
		e.preventDefault()
		nudgeAt(area.selectionStart, e.key === 'ArrowUp' ? 1 : -1, e.shiftKey)
	}

	// ⌥-drag up or down: a nudge every few pixels.
	function pointerDown(e) {
		if (!e.altKey || e.button) return
		const pos = posAt(e.clientX, e.clientY)
		if (pos == null || !nudge(area.value, pos, 1, false, drums(), jb.key())) return
		e.preventDefault()
		area.setPointerCapture(e.pointerId)
		area.focus({ preventScroll: true })
		area.setSelectionRange(pos, pos)
		let done = 0
		const move = (m) => {
			const want = Math.trunc((e.clientY - m.clientY) / 8)
			while (done !== want) {
				const dir = want > done ? 1 : -1
				if (!nudgeAt(area.selectionStart, dir, m.shiftKey)) break
				done += dir
			}
		}
		const up = () => {
			area.removeEventListener('pointermove', move)
			area.removeEventListener('pointerup', up)
		}
		area.addEventListener('pointermove', move)
		area.addEventListener('pointerup', up)
	}

	// The step pads for the drum bar the caret is in.
	const pads = createMemo(() => {
		const c = jb.caret()
		const s = jb.song()
		if (!s || !c || c.k < 0 || !drums().has(c.voice)) return null
		const line = lines()[c.ln - 1] ?? ''
		const steps = s.beats * s.steps
		return { ...c, line, steps, beat: s.steps, hits: stepsOf(line, c.k, steps) }
	})
	function toggle(i) {
		const p = pads()
		const r = toggleStep(p.line, p.k, i, p.steps)
		if (!r) return
		const start = startOf(p.ln)
		write(start + r.start, start + r.end, r.to, start + r.start + 1)
		if (p.hits[i] === '.') jb.audition(area.value, p.voice, 'x')
	}

	// The roll asked for a line: put the caret there and scroll it into view.
	createEffect(
		() => jb.wanted(),
		(want) => {
			if (!want || !area) return
			const ln = Math.min(want.ln, area.value.split('\n').length)
			const pos = startOf(ln) + want.col
			area.focus({ preventScroll: true })
			area.setSelectionRange(pos, pos)
			const top = sheet.querySelectorAll('.row')[ln - 1]?.offsetTop ?? 0
			if (top < area.scrollTop || top > area.scrollTop + area.clientHeight - 40) area.scrollTop = top - area.clientHeight / 3
			jb.follow(caretAt(area.value, pos), false)
		},
	)

	// Another song starts at its top.
	createEffect(
		() => jb.name(),
		() => {
			if (area) area.scrollTop = sheet.scrollTop = 0
		},
	)

	return (
		<section class="editor">
			<div class={{ code: true, piano: jb.piano(), pointing: pointing() }} style={{ '--w': `${width()}px` }}>
				<div class="sheet" ref={sheet} aria-hidden="true">
					<For each={lines()} keyed={false}>
						{(line, i) => {
							const ln = i + 1
							const errs = createMemo(() => wrong().get(ln))
							const note = createMemo(() => (ghost()?.ln === ln ? null : told(ln)))
							const marks = createMemo(
								() => {
									const out = (errs() ?? []).map((m) => ({ start: m.start, end: m.end, cls: 'bad' }))
									if (open() && hint().ln === ln) out.push({ start: hint().col, cls: 'at', text: '' })
									if (ghost()?.ln === ln) out.push({ start: ghost().col, cls: 'ghost', text: ghost().text })
									if (ruled()?.ln === ln) out.push(...ruled().marks)
									if (hover()?.ln === ln && !hover().note) out.push({ start: hover().start, cls: 'hot', text: '' })
									return out
								},
								{ equals: same },
							)
							return (
								<div class="row">
									{errs() ? <b>{ln}</b> : <span>{ln}</span>}
									<span class="line">
										<For each={mark(paint(line(), names()), marks())} keyed={false}>
											{(piece) => (
												<span
													class={[piece()[0], piece()[3]]}
													style={piece()[2] ? { '--c': colors()[piece()[2]] } : undefined}
													data-col={piece()[4] ?? undefined}
												>
													{piece()[1]}
												</span>
											)}
										</For>
										{line() ? '' : ' '}
										{note() && <span class="end" />}
									</span>
									{note() && (
										<span class={{ msg: true, fix: !!note().fix, hot: !!hover()?.note && hover().ln === ln }}>
											{note().msg}
											{note().fix && <ins>{note().fix.label}</ins>}
										</span>
									)}
								</div>
							)
						}}
					</For>
				</div>
				<textarea
					id="score"
					ref={area}
					spellcheck="false"
					aria-label="Score"
					value={draft()}
					onInput={(e) => {
						const value = e.currentTarget.value
						setDraft(value)
						unrest()
						moved()
						if (!writing) {
							take = null
							typed(caretAt(value, e.currentTarget.selectionStart).ln)
							offer(true)
						}
						clearTimeout(typing)
						typing = setTimeout(() => jb.setText(value), 300)
					}}
					onScroll={() => {
						sheet.scrollTop = area.scrollTop
						unrest()
					}}
					onKeyUp={(e) => {
						if (held.has(e.code)) release(e.code)
						moved()
					}}
					onKeyDown={keyDown}
					onPointerDown={(e) => {
						setHint(null)
						const at = whatAt(e.clientX, e.clientY)
						if (at?.fix) {
							e.preventDefault()
							fix(at.ln)
							return
						}
						pointerDown(e)
					}}
					onPointerMove={(e) => {
						if (e.buttons || e.altKey) return
						cancelAnimationFrame(frame)
						frame = requestAnimationFrame(() => rest(e.clientX, e.clientY))
					}}
					onPointerLeave={unrest}
					onFocus={() => setTimeout(() => document.activeElement === area && offer(false))}
					onBlur={() => {
						for (const code of [...held.keys()]) release(code)
						setHint(null)
						setCaretLn(0)
						setCaretPos(-1)
						typed(0)
					}}
					onPointerUp={moved}
				/>
				<ul id="suggest" ref={list} popover="manual">
					<For each={open() ? hint().items : []} keyed={false}>
						{(item, i) => (
							<li
								class={{ on: i === hint()?.i }}
								title="Write this here (Tab)"
								onMouseDown={(e) => {
									e.preventDefault()
									accept(item())
								}}
								onMouseEnter={() => pick(i)}
							>
								{item().word}
							</li>
						)}
					</For>
				</ul>
				<div id="tip" ref={tip} popover="manual">
					{hover()?.tip}
				</div>
			</div>
			{/* Always there, so the score doesn't jump as the caret comes and goes. */}
			<div id="steps" style={{ '--c': colors()[pads()?.voice] }}>
				<For each={pads()?.hits ?? []} keyed={false}>
					{(hit, i) => (
						<button
							type="button"
							data-hit={hit()}
							class={{ beat: i > 0 && i % pads().beat === 0 }}
							title="Switch this step on or off"
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => toggle(i)}
						/>
					)}
				</For>
			</div>
		</section>
	)
}
