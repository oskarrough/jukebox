// The chord pad, under the tape: the song's key's chords in the middle and
// biggest, their neighbours on the circle of fifths either side, each major
// chord over its relative minor. Pointing at one plays it; a tap writes it
// into the chord row where the next chord goes (outlined on the tape). The
// keys on the side colour every chord; with no voice playing the chords
// yet, one more key adds a pad that does. A chord in the score or on the
// tape drags up or down its ladder (chordLadder), the way a section drags.
import { For, Show, createSignal, flush } from 'solid-js'
import { compile } from '../score.js'
import { chordLadder, padChords, writeChord } from './pad.js'
import { nearest } from './arrange.js'
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

// The chord held: its ladder, the screen point of each rung (`x`, `ys`) and
// the rung it would land on.
const [held, setHeld] = createSignal(null)
const RUNG = 26

// The chord in bar `bar` of pattern `pattern` of score `text`, if any.
function chordIn(text, pattern, bar) {
	const sec = compile(text, pattern).loop.sections[0]
	const step = bar * (sec ? sec.beats * sec.steps : 0)
	return sec?.chords?.find((c) => step >= c.step && step < c.step + c.len)?.sym ?? null
}

// Picks up the chord in bar `bar` of `pattern`, which sits at `x`,`y` on
// screen: dragged up or down, it climbs its ladder, the rung nearest the
// pointer shown in the score and on the tape and strummed; let go, it's
// written as one edit. Esc or back home puts it back; a click without a
// drag does `click`.
export function holdChord(e, { pattern, bar, x, y, click }) {
	const base = jb.score()
	const sym = chordIn(base, pattern, bar)
	const x0 = e.clientX
	const y0 = e.clientY
	let dragged = false
	if (!sym) {
		const up = () => (removeEventListener('pointerup', up), click?.())
		return addEventListener('pointerup', up)
	}
	const { chords, home } = chordLadder(sym, jb.key())
	// Up the ladder up the screen, the whole of it on the screen.
	const top = y - (chords.length - 1 - home) * RUNG
	const bottom = y + home * RUNG
	const shift = Math.max(0, RUNG - top) - Math.max(0, bottom - (innerHeight - RUNG))
	const ys = chords.map((_, i) => y + shift - (i - home) * RUNG)
	// Held where it was grabbed.
	const off = y0 - ys[home]
	const texts = []
	const textOf = (i) => (texts[i] ??= writeChord(base, pattern, bar, chords[i]))
	let on = home
	const hold = (i) => {
		if (i === on) return
		on = i
		setHeld((h) => ({ ...h, on }))
		jb.holdChord(i === home ? null : (textOf(i)?.text ?? null), { pattern, bar })
	}
	const move = (m) => {
		if (!dragged && Math.hypot(m.clientX - x0, m.clientY - y0) < 5) return
		if (!dragged) setHeld({ chords, home, on, x, y, ys })
		dragged = true
		hold(
			nearest(
				chords.map((_, i) => i),
				(i) => ({ x: 0, y: ys[i] }),
				{ x: 0, y: m.clientY - off },
			),
		)
	}
	const cancel = () => {
		removeEventListener('pointermove', move)
		removeEventListener('pointerup', up)
		removeEventListener('pointercancel', cancel)
		removeEventListener('keydown', esc)
		jb.holdChord(null)
		setHeld(null)
		flush()
	}
	const esc = (k) => k.key === 'Escape' && (k.preventDefault(), (on = home), cancel())
	const up = () => {
		cancel()
		if (!dragged) return click?.()
		const out = on !== home && textOf(on)
		if (out) jb.draw(out.text, out.ln, out.col)
	}
	addEventListener('pointermove', move)
	addEventListener('pointerup', up)
	addEventListener('pointercancel', cancel)
	addEventListener('keydown', esc)
}

// Where a held chord can land: a chip for each rung of its ladder, above and
// below it, the one it would land on lit.
export function ChordLadder() {
	return (
		<Show when={held()}>
			{(h) => (
				<div class="ladder" popover="manual" ref={(el) => queueMicrotask(() => el.isConnected && el.showPopover())}>
					<For each={h().chords} keyed={false}>
						{(sym, i) => (
							<Show when={i !== h().home}>
								<span class="k" style={{ '--x': `${h().x}px`, '--y': `${h().ys[i]}px`, '--y0': `${h().y}px` }}>
									<button type="button" tabindex="-1" class={{ on: i === h().on }}>
										{sym()}
									</button>
								</span>
							</Show>
						)}
					</For>
				</div>
			)}
		</Show>
	)
}
