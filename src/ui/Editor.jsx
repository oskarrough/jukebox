// The score. You type into a see-through textarea; behind it, a painted copy
// of the text shows each voice in its roll colour, the bars, rests and
// comments, and a line number level with each line however many rows it wraps
// to. Lines with errors get a red number, the errors themselves sit below.
// It replays a moment after you stop typing. Where the caret is lights its
// bar on the roll; a note clicked on the roll puts the caret on it.
import { For, createEffect, createMemo, createSignal, onSettled } from 'solid-js'
import { jb } from './state.js'
import { caretAt } from './link.js'
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
					value={jb.text()}
					onInput={(e) => {
						const value = e.currentTarget.value
						setDraft(value)
						moved()
						clearTimeout(typing)
						typing = setTimeout(() => jb.setText(value), 300)
					}}
					onScroll={() => setScroll(area.scrollTop)}
					onKeyUp={moved}
					onPointerUp={moved}
				/>
			</div>
			<pre id="errors">
				{errors()
					.map((e) => `${e.line}: ${e.msg}`)
					.join('\n')}
			</pre>
		</section>
	)
}
