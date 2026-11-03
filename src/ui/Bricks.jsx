import { For } from 'solid-js'
import { BRICKS } from '../bricks.js'
import { jb } from './state.js'

// A loop brick: hover to hear it, click or tap to add it to every pattern, or
// drag it onto the song, or onto one pattern up in the display. A tap adds it
// and the song plays it, so it isn't heard twice.
export function Bricks() {
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
