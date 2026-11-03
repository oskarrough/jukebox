// The keyboard in the tape's tool slot. Its dots choose the same voice as
// the tape's brush; the score's caret only chooses where, not who plays.
import { createEffect, createMemo, createSignal, For, onSettled, untrack } from 'solid-js'
import { compile } from '../score.js'
import { keyLabel, OCTAVE_KEYS, octaveAt, pianoKeys } from './keyboard.js'
import { moment, record, recordStep } from './record.js'
import { jb } from './state.js'
import './piano.css'

export function VoicePicker() {
	return (
		<div class="brush-voices">
			<For each={jb.song()?.voices ?? []} keyed={(v) => v.name}>
				{(voice, i) => (
					<button
						type="button"
						class="chip brush-voice"
						hidden={voice().drum}
						style={{ '--c': jb.colors()[i()] }}
						aria-pressed={String(jb.activeVoice() === voice().name)}
						title={`Draw and play ${voice().name}`}
						onClick={() => jb.chooseVoice(voice().name)}
					>
						{voice().name}
					</button>
				)}
			</For>
		</div>
	)
}

export function Piano() {
	const [octave, setOctave] = createSignal(null)
	const [lit, setLit] = createSignal(new Set())
	const held = new Map()
	let cursor = null
	let last = null
	const register = () => octave() ?? 4
	const keys = createMemo(() => pianoKeys(register(), jb.key()))
	const colour = () => jb.colors()[jb.song()?.voices.findIndex((v) => v.name === jb.activeVoice())] ?? 'var(--c-french-grey)'
	const shift = (by) => setOctave(Math.max(0, Math.min(6, register() + by)))

	function write(out) {
		if (out) jb.draw(out.text, out.ln, out.col)
	}
	function down(code) {
		if (held.has(code)) return true
		if (code in OCTAVE_KEYS) {
			shift(OCTAVE_KEYS[code])
			return true
		}
		const key = keys().find((k) => k.code === code)
		if (!key) return false
		const voice = jb.activeVoice()
		if (!voice) return true
		const text = jb.score()
		const playing = jb.live()
		const at = playing && moment(jb.nowPlaying(), jb.elapsed())
		held.set(code, { song: jb.name(), voice, note: key.note, at, since: performance.now() })
		setLit(new Set(held.keys()))
		jb.audition(text, voice, key.note)
		if (playing) return true
		const song = jb.whole()
		const pattern = jb.caret()?.pattern ?? song?.loop.sections[0]?.name ?? song?.intro.sections[0]?.name
		const section = [...(song?.intro.sections ?? []), ...(song?.loop.sections ?? [])].find((s) => s.name === pattern)
		const same = cursor?.text === text && cursor.voice === voice && cursor.pattern === pattern
		const step = same ? cursor.step : Math.max(0, jb.caret()?.k ?? 0) * (section?.beats ?? 4) * (section?.steps ?? 4)
		const out = recordStep(text, { voice, pattern, step, note: key.note })
		write(out)
		if (out) cursor = { text: out.text, voice, pattern, step: out.step }
		return true
	}
	function up(code) {
		const h = held.get(code)
		if (!h) return
		held.delete(code)
		setLit(new Set(held.keys()))
		if (!h.at || h.song !== jb.name()) return
		const { s, step, stepDur } = h.at
		const text = jb.score()
		const song = compile(text, s.name)
		if (song.errors.length) return
		const chord =
			last?.pattern === s.name && last.voice === h.voice && last.step === step && Math.abs(last.since - h.since) < stepDur * 1000
		const from = step * stepDur
		write(record(text, song, { voice: h.voice, note: h.note, from, to: from + (performance.now() - h.since) / 1000, chord }))
		last = { pattern: s.name, voice: h.voice, step, since: h.since }
	}
	const release = () => {
		for (const code of held.keys()) up(code)
	}
	createEffect(jb.live, (live) => {
		if (!live) untrack(release)
		last = null
	})
	createEffect(
		() => [jb.activeVoice(), jb.name()],
		([voice]) => {
			const line = untrack(jb.score)
				.split('\n')
				.find((l) => l.split('|')[0].trim() === voice)
			setOctave(Math.max(0, Math.min(6, line ? (octaveAt(line, 0, untrack(jb.key)) ?? 4) : 4)))
			cursor = null
		},
	)

	onSettled(() => {
		const keydown = (e) => {
			if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, select, [popover]:popover-open')) return
			if (e.repeat && (held.has(e.code) || e.code in OCTAVE_KEYS)) {
				e.preventDefault()
				e.stopImmediatePropagation()
				return
			}
			if (!down(e.code)) return
			e.preventDefault()
			e.stopImmediatePropagation()
		}
		const keyup = (e) => up(e.code)
		window.addEventListener('keydown', keydown, true)
		window.addEventListener('keyup', keyup, true)
		window.addEventListener('blur', release)
		return () => {
			window.removeEventListener('keydown', keydown, true)
			window.removeEventListener('keyup', keyup, true)
			window.removeEventListener('blur', release)
			// Closing the piano must not write through a disposed component.
			held.clear()
		}
	})

	return (
		<div id="piano" class="piano-panel" style={{ '--p': colour() }}>
			<VoicePicker />
			<div class="piano-controls">
				<span class="k">
					<button type="button" title="Play an octave lower (Z)" onClick={() => shift(-1)}>
						−
					</button>
				</span>
				<output>{register()}</output>
				<span class="k">
					<button type="button" title="Play an octave higher (X)" onClick={() => shift(1)}>
						+
					</button>
				</span>
			</div>
			<div class="piano-keys">
				<For each={keys()} keyed={(k) => k.code}>
					{(key) => (
						<button
							type="button"
							class={['piano-key', { above: key().above, held: lit().has(key().code) }]}
							style={{ '--column': key().column }}
							title={`Play ${key().note} (${keyLabel(key().code)})`}
							aria-pressed={String(lit().has(key().code))}
							onPointerDown={(e) => {
								if (e.button !== 0) return
								e.preventDefault()
								e.currentTarget.setPointerCapture(e.pointerId)
								down(key().code)
							}}
							onPointerUp={() => up(key().code)}
							onPointerCancel={() => up(key().code)}
							onKeyDown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault()
									down(key().code)
								}
							}}
							onKeyUp={(e) => {
								if (e.key === 'Enter' || e.key === ' ') up(key().code)
							}}
						>
							<span>{key().note}</span>
							<kbd>{keyLabel(key().code)}</kbd>
						</button>
					)}
				</For>
			</div>
		</div>
	)
}
