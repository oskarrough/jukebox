// The song's sections in play order, each as long as it lasts, in the
// display where the position bar was: the play line once, then the loop
// (its first section edged green). Click one to play from it; drag to move,
// ⌥-drag to copy, drag off to take it out; drop a brick on one to add it
// there only. Each change rewrites the play and loop lines.
import { For, Show, createMemo, createSignal } from 'solid-js'
import { reorder } from './arrange.js'
import { jb } from './state.js'
import { PlusIcon } from './Icons.jsx'

const label = (s) => s.name + (s.trans ? (s.trans > 0 ? '+' : '') + s.trans : '')

export function Sections() {
	let strip
	// The section being dragged: where it'd land, copied or taken out, or how
	// many times it'd play when stretched by its edge.
	const [held, setHeld] = createSignal(null)
	// The section a brick is over.
	const [over, setOver] = createSignal(null)
	const total = () => jb.length(jb.whole()) || 1
	const fixed = () => jb.sections().fixed
	const loops = () => jb.sections().all.filter((s) => s.line === 'loop').length
	const shown = createMemo(() => {
		const all = jb.sections().all
		const h = held()
		const mark = (o) => all.map((s) => (s.i === h.from ? { ...s, ...o } : s))
		const list = !h
			? all
			: h.times
				? mark({ times: h.times, dur: (all[h.from].dur / all[h.from].times) * h.times, moved: true })
				: h.away
					? mark({ gone: true })
					: reorder(all, h.from, h.to, h.copy) || all
		const T = list.reduce((n, s) => n + s.dur, 0) || 1
		let t = 0
		return list.map((s) => {
			const out = { ...s, left: (t / T) * 100, width: (s.dur / T) * 100 }
			t += s.dur
			return out
		})
	})
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
		// By its edge: once more for every bit further right, up to 16 times.
		const edge = e.target.classList.contains('edge')
		const step = Math.min(32, e.currentTarget.getBoundingClientRect().width / s.times)
		// What the drag would do, as of the last move.
		let h = null
		const hold = (next) => setHeld((h = next))
		const move = (e) => {
			if (!dragged && Math.hypot(e.clientX - x0, e.clientY - y0) < 5) return
			dragged = true
			if (edge) return hold({ from: s.i, times: Math.max(1, Math.min(16, s.times + Math.round((e.clientX - x0) / step))) })
			const bar = strip.getBoundingClientRect()
			const t = ((e.clientX - bar.left) / bar.width) * total()
			const to = jb.sections().all.filter((x) => x.start + x.dur / 2 < t).length
			const off = Math.abs(e.clientY - (bar.top + bar.height / 2)) > bar.height / 2 + 24
			const away = off && !e.altKey && !(s.line === 'loop' && loops() === 1)
			hold({ from: s.i, to, copy: e.altKey, away })
		}
		const cancel = () => {
			window.removeEventListener('pointermove', move)
			window.removeEventListener('pointerup', up)
			window.removeEventListener('pointercancel', cancel)
			setHeld(null)
		}
		const up = () => {
			cancel()
			if (!h) return
			if (h.times) jb.repeat(h.from, h.times)
			else if (h.away) jb.remove(h.from)
			else jb.moveTo(h.from, h.to, h.copy)
		}
		window.addEventListener('pointermove', move)
		window.addEventListener('pointerup', up)
		window.addEventListener('pointercancel', cancel)
	}
	const isBrick = (e) => e.dataTransfer.types.includes('application/x-brick')

	return (
		<>
			<div class={{ sections: true, seg: true, holding: !!held() }} ref={strip}>
				<For each={shown()} keyed={false}>
					{(s, k) => (
						<button
							type="button"
							class={{
								section: true,
								loop: k === first() && first() > 0,
								here: jb.caret()?.pattern === s().name,
								on: head() >= s().start && head() < s().start + s().dur && !held(),
								moved: !!s().moved,
								gone: !!s().gone,
								over: over() === s().i,
							}}
							style={{ '--x': s().left / 100, '--w': s().width / 100 }}
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
