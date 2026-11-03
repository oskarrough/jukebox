// The chord pad, under the tape: the song's key's chords in the middle and
// biggest, their neighbours on the circle of fifths either side, each major
// chord over its relative minor. Pointing at one plays it; a tap writes it
// into the chord row where the next chord goes (outlined on the tape). The
// keys on the side colour every chord; with no voice playing the chords
// yet, one more key adds a pad that does.
import { For, Show } from 'solid-js'
import { padChords } from './pad.js'
import { jb } from './state.js'

const MODS = [
	['7', 'Add the 7th to every chord'],
	['9', 'Add the 7th and 9th to every chord'],
	['sus', 'Swap every chord’s 3rd for the 4th'],
	['add9', 'Add the 9th to every chord, without the 7th'],
]
export function ChordPad() {
	const columns = () => padChords(jb.key(), jb.mod())
	const where = () => {
		const t = jb.target()
		return t.pattern ? `bar ${t.bar + 1} of ${t.pattern}` : 'a new pattern'
	}
	const chorded = () => [jb.whole()?.intro, jb.whole()?.loop].some((tl) => tl?.sections.some((s) => s.chords?.length))

	const Chord = (props) => (
		<span class="k">
			<button
				type="button"
				class={{ home: props.home, on: jb.chordNow() === props.sym }}
				data-far={props.far}
				title={`Write ${props.sym} into ${where()}`}
				onPointerEnter={(e) => {
					if (e.pointerType === 'mouse') jb.hearChord(props.sym)
				}}
				onPointerDown={() => jb.hearChord(props.sym)}
				onClick={() => jb.tapChord(props.sym)}
			>
				{props.sym}
			</button>
		</span>
	)

	return (
		<div class="chord-pad" onPointerLeave={jb.stopSample}>
			<Show when={chorded() && !jb.harmony()}>
				<span class="k offer">
					<button type="button" title="Add a pad that plays these chords" onClick={jb.addChordVoice}>
						+ pad
					</button>
				</span>
			</Show>
			<div class="wheel">
				<For each={columns()} keyed={false}>
					{(col) => (
						<>
							<Chord sym={col().major} far={col().far} home={col().home === 'major'} />
							<Chord sym={col().minor} far={col().far} home={col().home === 'minor'} />
						</>
					)}
				</For>
			</div>
			<div class="mods seg">
				<For each={MODS}>
					{([m, tip]) => (
						<button
							type="button"
							aria-pressed={String(jb.mod() === m)}
							title={jb.mod() === m ? 'Play plain chords again' : tip}
							onClick={() => jb.setMod((on) => (on === m ? null : m))}
						>
							{m}
						</button>
					)}
				</For>
			</div>
		</div>
	)
}
