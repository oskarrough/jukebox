// The song's sections in play order, each as long as it lasts, in the
// display where the position bar was: the play line once, then the loop
// (its first section edged green). Click one to play from it; drag to move,
// ⌥-drag to copy, drag down to take it out; drop a brick on one to add it
// there only. While held, marks show where it can land, the score and the
// tape show the song as it would be and you hear the join; Esc puts it back.
// Each change rewrites the play and loop lines.
import { For, Show, createMemo, createSignal, flush } from 'solid-js'
import { dragStates, layout, nearest, unchanged, writeOrder } from './arrange.js'
import { jb } from './state.js'
import { PlusIcon } from './Icons.jsx'

const label = (s) => s.name + (s.trans ? (s.trans > 0 ? '+' : '') + s.trans : '')

export function Sections() {
	let strip
	// The section being dragged: every arrangement it can lead to, and the
	// one it would make if let go now.
	const [held, setHeld] = createSignal(null)
	// The section a brick is over.
	const [over, setOver] = createSignal(null)
	const total = () => jb.length(jb.whole()) || 1
	const fixed = () => jb.sections().fixed
	const shown = createMemo(() => layout(held()?.state.list ?? jb.sections().all))
	// Where the held section can land, as it is now: a mark for each gap, lit
	// for the one it would land in.
	const spots = createMemo(() => {
		const h = held()
		if (!h || h.edge) return []
		return h.states.filter((st) => !st.away && !st.copy === !h.state.copy).map((st) => ({ x: st.at, on: st === h.state }))
	})
	const away = () => held()?.states.some((st) => st.away && !held().state.copy)
	// Where playing has got to in the whole song, also while one pattern loops.
	const head = () => {
		const o = jb.only()
		const s = o && jb.sections().all.find((s) => s.name === o)
		return s ? s.start + Math.min(jb.pos(), s.dur) : jb.pos()
	}
	const first = () => shown().findIndex((s) => s.line === 'loop')

	let dragged = false
	function press(e, s) {
		if (e.button || fixed()) return
		const x0 = e.clientX
		const y0 = e.clientY
		dragged = false
		const all = jb.sections().all
		const base = jb.score()
		// By its edge: once more for every bit further right, up to 16 times.
		const edge = e.target.classList.contains('edge')
		const step = Math.min(32, e.currentTarget.getBoundingClientRect().width / s.times)
		// Each arrangement, with where the held section's middle sits on the strip.
		const states = dragStates(all, s.i, edge).map((st) => {
			const k = st.list.findIndex((x) => x.moved || x.gone)
			const at = layout(st.list)[k]
			return { ...st, at: at.left + at.width / 2, k }
		})
		const home = states.find((st) => unchanged(st, all))
		const bar = strip.getBoundingClientRect()
		// Held where it was grabbed, not by its middle.
		const off = x0 - (bar.left + home.at * bar.width)
		let h = null
		const hold = (state) => {
			if (h?.state === state) return
			setHeld((h = { from: s.i, edge, states, state }))
			const still = unchanged(state, all)
			jb.setPreview(
				still
					? null
					: writeOrder(
							base,
							state.list.filter((x) => !x.gone),
						),
			)
			if (!still && !jb.live()) taste(state)
		}
		// The join the held section makes where it would land.
		function taste(state) {
			const list = state.list.filter((x) => !x.gone)
			const before = state.list.slice(0, state.k).reduce((n, x) => n + (x.gone ? 0 : x.dur), 0)
			const one = state.list[state.k].dur / state.list[state.k].times
			const seam = state.times ? before + one * (state.times - 1) : before
			if (seam > 0 && (!state.times || state.times > 1)) jb.taste(writeOrder(base, list), seam)
		}
		const move = (e) => {
			if (!dragged && Math.hypot(e.clientX - x0, e.clientY - y0) < 5) return
			dragged = true
			if (edge) {
				const times = Math.max(1, Math.min(16, s.times + Math.round((e.clientX - x0) / step)))
				return hold(states[times - 1])
			}
			const bar = strip.getBoundingClientRect()
			const spot = strip.querySelector('.away')?.getBoundingClientRect()
			const p = { x: e.clientX - off, y: e.clientY }
			const mid = bar.top + bar.height / 2
			const where = (st) =>
				st.away ? { x: p.x, y: spot ? spot.top + spot.height / 2 : bar.bottom + bar.height } : { x: bar.left + st.at * bar.width, y: mid }
			hold(
				nearest(
					states.filter((st) => (e.altKey ? st.copy : !st.copy)),
					where,
					p,
				),
			)
		}
		const cancel = () => {
			window.removeEventListener('pointermove', move)
			window.removeEventListener('pointerup', up)
			window.removeEventListener('pointercancel', cancel)
			window.removeEventListener('keydown', esc)
			jb.setPreview(null)
			setHeld(null)
			flush()
		}
		const esc = (e) => e.key === 'Escape' && (e.preventDefault(), (h = null), cancel())
		const up = () => {
			const st = h?.state
			cancel()
			if (!st || unchanged(st, all)) return
			if (st.times) jb.repeat(s.i, st.times)
			else if (st.away) jb.remove(s.i)
			else jb.moveTo(s.i, st.to, st.copy)
		}
		window.addEventListener('pointermove', move)
		window.addEventListener('pointerup', up)
		window.addEventListener('pointercancel', cancel)
		window.addEventListener('keydown', esc)
	}
	const isBrick = (e) => e.dataTransfer.types.includes('application/x-brick')

	return (
		<>
			<div class={{ sections: true, seg: true, holding: !!held() }} ref={strip}>
				<For each={shown()} keyed={(s) => (s.copy ? 'copy' : s.i)}>
					{(s, k) => (
						<button
							type="button"
							class={{
								section: true,
								loop: k() === first() && first() > 0,
								here: jb.caret()?.pattern === s().name,
								on: head() >= s().start && head() < s().start + s().dur && !held(),
								moved: !!s().moved,
								gone: !!s().gone,
								over: over() === s().i,
							}}
							style={{ '--x': s().left, '--w': s().width }}
							aria-label={label(s())}
							title={fixed() ? `Play ${label(s())}` : `Play ${label(s())}; drag to move, ⌥-drag to copy, drag off to remove`}
							onPointerDown={(e) => press(e, s())}
							onClick={() => {
								if (!dragged) jb.playSection(s())
								dragged = false
							}}
							onDragOver={(e) => {
								if (!isBrick(e)) return
								e.preventDefault()
								setOver(s().i)
							}}
							onDragLeave={() => setOver(null)}
							onDrop={(e) => {
								if (!isBrick(e)) return
								e.preventDefault()
								e.stopPropagation()
								setOver(null)
								jb.setDragging(false)
								jb.drop(e.dataTransfer.getData('application/x-brick'), s().name)
							}}
						>
							<For each={Array.from({ length: s().times })}>
								{() => (
									<span style={{ '--letters': label(s()).length * 0.62 }}>
										<b>{label(s())}</b>
									</span>
								)}
							</For>
							<Show when={!fixed()}>
								<i class="edge" title={`Drag to repeat ${label(s())}`} />
							</Show>
						</button>
					)}
				</For>
				<Show when={!held()}>
					<i class="head" style={{ '--x': head() / total() }} />
				</Show>
				<For each={spots()} keyed={false}>
					{(p) => <i class={{ spot: true, on: p().on }} style={{ '--x': p().x }} />}
				</For>
				<Show when={away()}>
					<i class={{ away: true, on: !!held()?.state.away }} />
				</Show>
			</div>
			<span class="k add-section">
				<button
					type="button"
					disabled={fixed() || !shown().length}
					title="Add a pattern that starts as a copy of the one you’re in"
					onClick={jb.addSection}
				>
					<PlusIcon />
				</button>
			</span>
		</>
	)
}
