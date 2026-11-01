// The voices beside the score, each in its roll colour: click to mute, ⌥-click
// to solo. The square lights while the voice plays a note. Below them, the
// loop bricks.
import { For, Show } from 'solid-js'
import { BRICKS } from '../bricks.js'
import { jb } from './state.js'
import { BricksIcon } from './Icons.jsx'

export function Voices() {
	return (
		<section class="voices">
			<div id="voices">
				<For each={jb.song()?.voices ?? []} keyed={(v) => v.name}>
					{(voice, i) => (
						<button
							type="button"
							class={{ fresh: jb.fresh() === voice().name }}
							style={{ '--c': jb.colors()[i()], '--a': (jb.levels()[i()] ?? 0).toFixed(2) }}
							aria-pressed={String(!jb.isMuted(voice().name))}
							title={`${jb.isMuted(voice().name) ? 'Unmute' : 'Mute'} ${voice().name} (⌥-click to solo)`}
							onClick={(e) => jb.toggleVoice(voice().name, e.altKey)}
						>
							<i />
							<span>{voice().name}</span>
							<small>{voice().inst}</small>
						</button>
					)}
				</For>
			</div>
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

// A loop brick: tap to add it to every pattern, or drag it onto the song.
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
						title={`Add ${b.label} (${b.inst}) to every pattern, or drag it in`}
						onClick={() => jb.drop(b.id)}
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
