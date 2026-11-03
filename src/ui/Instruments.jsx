// The instruments a voice can switch to, grouped as the guide groups them,
// opened from a voice's instrument name. Moving through them plays each one;
// picking one rewrites the voice's line.
import { createEffect, createMemo, For, Show } from 'solid-js'
import { GROUPS } from '../instruments.js'
import { jb } from './state.js'

const MELODIC_GROUPS = GROUPS.filter(([group]) => group !== 'Drums')
const DRUM_GROUPS = [['', GROUPS.find(([group]) => group === 'Drums')[1]]]

// The list for `props.voice` (a voice's name, or null), anchored to the
// instrument name that opened it.
export function Instruments(props) {
	let pop
	const voice = () => jb.song()?.voices.find((v) => v.name === props.voice)
	// The last one heard, so focusing what the pointer is on doesn't play it twice.
	let heard = null
	function hear(inst) {
		if (inst === heard) return
		heard = inst
		jb.hearInstrument(props.voice, inst)
	}
	const current = createMemo(() => voice()?.inst)
	// Opening starts on the voice's own instrument, without playing it.
	function start(inst) {
		heard = inst
		requestAnimationFrame(() => pop.querySelector('[aria-pressed="true"]')?.focus())
	}
	createEffect(
		() => [props.voice, current()],
		([v, inst]) => {
			if (v && pop.matches(':popover-open')) start(inst)
		},
	)
	// Arrows move through the list; hovering moves there too.
	function keyDown(e) {
		const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key]
		if (!step) return
		e.preventDefault()
		const all = [...pop.querySelectorAll('button')]
		const i = all.indexOf(document.activeElement)
		all[(i + step + all.length) % all.length]?.focus()
	}
	function pick(inst) {
		const name = props.voice
		pop.hidePopover()
		if (inst !== current()) jb.swap(name, inst)
		document.querySelector(`#voices [data-voice="${name}"] .inst`)?.focus()
	}
	return (
		<div
			id="instruments"
			class="pop"
			popover
			ref={pop}
			onToggle={(e) => {
				if (e.newState === 'open') return start(current())
				jb.stopSample()
				props.onClose()
			}}
			onKeyDown={keyDown}
		>
			<Show when={voice()}>
				<For each={voice().drum ? DRUM_GROUPS : MELODIC_GROUPS}>
					{([group, list]) => (
						<div class="shelf">
							<Show when={group}>
								<h4>{group}</h4>
							</Show>
							<div>
								<For each={list}>
									{([inst, sound]) => (
										<button
											type="button"
											aria-pressed={String(inst === current())}
											title={`Switch to ${inst}: ${sound}`}
											onPointerEnter={(e) => e.currentTarget.focus({ preventScroll: true })}
											onFocus={() => hear(inst)}
											onClick={() => pick(inst)}
										>
											{inst}
										</button>
									)}
								</For>
							</div>
						</div>
					)}
				</For>
			</Show>
		</div>
	)
}
