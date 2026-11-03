// The voices beside the score, each in its roll colour: click to mute, ⌥-click
// to solo. The square lights while the voice plays a note. Click the
// instrument's name to hear others and switch to one. Below them, the loop
// bricks.
import { createSignal, For, Show } from 'solid-js'
import { BRICKS } from '../bricks.js'
import { jb } from './state.js'
import { BricksIcon } from './Icons.jsx'
import { Instruments } from './Instruments.jsx'

export function Voices() {
	// The voice whose instruments are open, if any.
	const [swapping, setSwapping] = createSignal(null)
	return (
		<section class="voices">
			<div id="voices">
				<For each={jb.song()?.voices ?? []} keyed={(v) => v.name}>
					{(voice, i) => (
						<div
							class={{ voice: true, fresh: jb.fresh() === voice().name }}
							data-voice={voice().name}
							style={{ '--c': jb.colors()[i()], '--a': (jb.levels()[i()] ?? 0).toFixed(2) }}
						>
							<button
								type="button"
								aria-pressed={String(!jb.isMuted(voice().name))}
								title={`${jb.isMuted(voice().name) ? 'Unmute' : 'Mute'} ${voice().name} (⌥-click to solo)`}
								onClick={(e) => jb.toggleVoice(voice().name, e.altKey)}
							>
								<i />
								<span>{voice().name}</span>
							</button>
							<button
								type="button"
								class="inst"
								popovertarget="instruments"
								style={{ 'anchor-name': swapping() === voice().name ? '--swapping' : undefined }}
								title={`Switch ${voice().name} to another instrument`}
								onClick={(e) => {
									// Open on another voice: stay open, on this one.
									if (swapping() && swapping() !== voice().name) e.preventDefault()
									setSwapping(voice().name)
								}}
							>
								{voice().inst}
							</button>
						</div>
					)}
				</For>
			</div>
			<Instruments voice={swapping()} onClose={() => setSwapping(null)} />
			<button
				class="icon add"
				type="button"
				aria-expanded={String(jb.bricksOpen())}
				title={jb.bricksOpen() ? 'Hide loop bricks' : 'Show loop bricks'}
				onClick={() => jb.setBricksOpen((open) => !open)}
			>
				<BricksIcon />
			</button>
			<Show when={jb.bricksOpen()}>
				<Bricks />
			</Show>
		</section>
	)
}

// A loop brick: hover to hear it, tap to add it to every pattern, or drag it
// onto the song, or onto one pattern up in the display.
function Bricks() {
	return (
		<div id="bricks">
			<For each={BRICKS}>
				{(b) => (
					<button
						type="button"
						class="brick"
						data-shelf={b.shelf}
						draggable="true"
						title={`Add ${b.label} (${b.inst}) to every pattern, or drag it onto one`}
						onClick={() => jb.drop(b.id)}
						onPointerEnter={() => jb.hearBrick(b.id)}
						onPointerLeave={() => jb.stopSample()}
						onFocus={(e) => {
							if (!e.currentTarget.matches(':hover')) jb.hearBrick(b.id)
						}}
						onDragStart={(e) => {
							e.dataTransfer.setData('application/x-brick', b.id)
							e.dataTransfer.effectAllowed = 'copy'
							jb.setDragging(true)
						}}
						onDragEnd={() => jb.setDragging(false)}
					>
						{b.label}
						<span class="steps">
							<For each={b.steps ? b.steps.replace(/\s+/g, '').split('') : b.notes}>
								{(c) => <i class={c === '.' ? '' : c === '-' ? 'h' : 'x'} />}
							</For>
						</span>
					</button>
				)}
			</For>
		</div>
	)
}
