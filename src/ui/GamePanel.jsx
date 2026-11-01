// How the game would place the song: where it plays from, how far away, and
// whether you're inside a car. Tapping the lit source hears it as written.
import { For } from 'solid-js'
import { SOURCES } from '../effects.js'
import { jb } from './state.js'

const HEARD = {
	radio: 'Hear it from a Späti radio',
	bar: 'Hear it through a bar door',
	window: 'Hear it from an open window',
	car: 'Hear it from a passing car',
	convoy: 'Hear it from a wedding convoy',
	own: 'Hear it on your own car radio',
}

export function GamePanel() {
	const lit = (id) => jb.inGame() && jb.fx.source.kind === id
	return (
		<div id="game" class={{ pop: true, on: jb.inGame() }} popover>
			<div class="pads">
				<For each={SOURCES}>
					{(src) => (
						<button
							type="button"
							class={{ pad: true, on: lit(src.id) }}
							title={lit(src.id) ? 'Hear the song as written' : HEARD[src.id]}
							onClick={() => jb.pickSource(src.id)}
						>
							{src.label}
						</button>
					)}
				</For>
			</div>
			<label class="fader" title="Move the listener closer or further away">
				<input
					type="range"
					min="0"
					max="45"
					step="0.5"
					value={jb.fx.distance.d}
					disabled={!jb.inGame() || jb.own()}
					onInput={(e) => {
						const d = Number(e.currentTarget.value)
						jb.setFx((s) => void (s.distance.d = d))
					}}
				/>
				<output>{jb.own() ? '0 m' : `${Math.round(jb.fx.distance.d * 3)} m`}</output>
			</label>
			<label class="toggle" title="Hear it from inside a car">
				<input
					type="checkbox"
					checked={!!jb.fx.inferno.inCar}
					disabled={!jb.inGame()}
					onChange={(e) => {
						const inCar = e.currentTarget.checked
						jb.setFx((s) => void (s.inferno.inCar = inCar))
					}}
				/>
				In a car
			</label>
		</div>
	)
}
