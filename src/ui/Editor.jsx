// The score. You type into a see-through textarea; behind it, a painted copy
// of the text shows each voice in its roll colour, the bars, rests and
// comments, and a line number level with each line however many rows it wraps
// to. Lines with errors get a red number, the errors themselves sit below.
// It replays a moment after you stop typing. Where the caret is lights its
// bar on the roll; a note clicked on the roll puts the caret on it. ⌥↑/↓ or
// an ⌥-drag nudges the note, number or drum step there; on a drum line, pads
// under the score switch its steps on and off.
import { For, createEffect, createMemo, createSignal, onSettled } from 'solid-js'
import { jb } from './state.js'
import { caretAt } from './link.js'
import { nudge, stepsOf, toggleStep } from './nudge.js'
import { paint } from './paint.js'

export function Editor() {
	let area
	let sheet
	let typing = 0
	// What's in the box right now, ahead of the song while you type.
	const [draft, setDraft] = createSignal(() => jb.text())
	const settled = () => draft() === jb.text()
	// A song with nothing in it yet isn't wrong, just empty.
	const errors = () => (settled() && !jb.parsed().empty ? jb.parsed().errors : [])
	const bad = createMemo(() => new Set(errors().map((e) => e.line)))
	const lines = createMemo(() => draft().split('\n'))
	const [width, setWidth] = createSignal(0)
	const [scroll, setScroll] = createSignal(0)
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
	const moved = () => jb.follow(caretAt(area.value, area.selectionStart), true)

	// Puts `to` in place of start…end the way typing would, so ⌘Z undoes it,
	// and leaves the caret at `caret`.
	function write(start, end, to, caret) {
		area.focus({ preventScroll: true })
		area.setSelectionRange(start, end)
		document.execCommand('insertText', false, to)
		area.setSelectionRange(caret, caret)
		moved()
	}

	// Nudges what's at `pos` by `dir`, and plays it. Whether there was anything to nudge.
	function nudgeAt(pos, dir, big) {
		const r = nudge(area.value, pos, dir, big, drums(), jb.key())
		if (!r) return false
		write(r.start, r.end, r.to, Math.min(Math.max(pos, r.start), r.start + r.to.length))
		if (r.voice) jb.audition(r.voice, r.to)
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
		const start =
			lines()
				.slice(0, p.ln - 1)
				.join('\n').length + (p.ln > 1 ? 1 : 0)
		write(start + r.start, start + r.end, r.to, start + r.start + 1)
		if (p.hits[i] === '.') jb.audition(p.voice, 'x')
	}

	// The roll asked for a line: put the caret there and scroll it into view.
	createEffect(
		() => jb.wanted(),
		(want) => {
			if (!want || !area) return
			const lines = area.value.split('\n')
			const ln = Math.min(want.ln, lines.length)
			const pos = lines.slice(0, ln - 1).join('\n').length + (ln > 1 ? 1 : 0) + want.col
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
			if (area) area.scrollTop = 0
			setScroll(0)
		},
	)

	return (
		<section class="editor">
			<div class="code" style={{ '--w': `${width()}px` }}>
				<div class="sheet" ref={sheet} aria-hidden="true">
					<div style={{ transform: `translateY(${-scroll()}px)` }}>
						<For each={lines()} keyed={false}>
							{(line, i) => (
								<div class="row">
									{bad().has(i + 1) ? <b>{i + 1}</b> : <span>{i + 1}</span>}
									<span class="line">
										<For each={paint(line(), names())} keyed={false}>
											{(piece) => (
												<span class={piece()[0]} style={piece()[2] ? { '--c': colors()[piece()[2]] } : undefined}>
													{piece()[1]}
												</span>
											)}
										</For>
										{line() ? '' : ' '}
									</span>
								</div>
							)}
						</For>
					</div>
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
						moved()
						clearTimeout(typing)
						typing = setTimeout(() => jb.setText(value), 300)
					}}
					onScroll={() => setScroll(area.scrollTop)}
					onKeyUp={moved}
					onKeyDown={keyDown}
					onPointerDown={pointerDown}
					onPointerUp={moved}
				/>
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
			<pre id="errors">
				{errors()
					.map((e) => `${e.line}: ${e.msg}`)
					.join('\n')}
			</pre>
		</section>
	)
}
