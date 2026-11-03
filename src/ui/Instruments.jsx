// The instruments a voice can switch to, grouped as the guide groups them,
// opened from a voice's instrument name. Moving through them plays each one;
// picking one rewrites the voice's line.
import { createEffect, createMemo, For, Show } from 'solid-js'
import { DRUMS, MELODIC } from '../score.js'
import { jb } from './state.js'

// [group, [instrument, what it is]…]; anything the guide doesn't group yet
// lands at the end.
const GROUPS = [
	[
		'Keys and mallets',
		[
			['rhodes', 'tine electric piano'],
			['organ'],
			['pipe', 'pipe organ'],
			['harpsichord'],
			['accordion'],
			['steeldrum'],
			['marimba'],
			['vibes'],
			['celesta'],
			['glock'],
			['xylophone'],
			['musicbox'],
			['bell'],
			['timpani'],
		],
	],
	[
		'Strings',
		[
			['strings', 'string section'],
			['fiddle'],
			['pizz', 'plucked strings'],
			['harp'],
			['guitar'],
			['drive', 'overdriven electric guitar'],
			['wah', 'funk guitar through a wah'],
			['banjo'],
			['oud'],
			['saz', 'bağlama, brighter and shorter than the oud'],
			['qanun', 'zither'],
		],
	],
	[
		'Winds and brass',
		[['flute'], ['ney', 'reed flute'], ['clarinet'], ['oboe'], ['bassoon'], ['brass', 'brass section'], ['trumpet'], ['horn'], ['tuba']],
	],
	[
		'Voices',
		[
			['choir', 'sings ah'],
			['voices', 'a soft oo pad'],
			['chop', 'one clipped sung syllable'],
		],
	],
	[
		'Bass',
		[['808', 'sliding sub'], ['logdrum', 'amapiano log drum'], ['ebass', 'picked electric bass'], ['fretless'], ['upright'], ['synbass']],
	],
	[
		'Synths',
		[
			['moog', 'mono lead, made for slides'],
			['pad'],
			['chip'],
			['cowbell808', 'the 808 cowbell as notes'],
			['sine'],
			['square'],
			['saw'],
			['triangle'],
		],
	],
]
const grouped = new Set(GROUPS.flatMap(([, list]) => list.map(([i]) => i)))
const MELODIC_GROUPS = [...GROUPS, ['', MELODIC.filter((i) => !grouped.has(i)).map((i) => [i])]].filter(([, list]) => list.length)
const DRUM_GROUPS = [['', DRUMS.map((i) => [i])]]

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
									{([inst, what]) => (
										<button
											type="button"
											aria-pressed={String(inst === current())}
											title={`Switch to ${inst}${what ? `: ${what}` : ''}`}
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
