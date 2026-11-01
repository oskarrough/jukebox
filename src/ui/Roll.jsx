// The black screen with the piano roll, redrawn every frame, the bars the
// score's caret is in lit. Which voices it finds sounding feeds the voices'
// activity edges. Clicking jumps there, and the score to the note's line.
import { onSettled } from 'solid-js'
import { drawRoll, hitRoll } from '../roll.js'
import { jb } from './state.js'

export function Roll() {
	let canvas
	onSettled(() => {
		let frame = 0
		let levels = []
		const draw = () => {
			frame = requestAnimationFrame(draw)
			const song = jb.nowPlaying()
			if (!song) return canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
			const sounding = drawRoll(canvas, song, jb.elapsed(), jb.mutedSet(), jb.marks())
			const next = song.voices.map((_, i) => (jb.live() && sounding.has(i) ? 1 : (levels[i] ?? 0) * 0.85))
			const quiet = (l) => (l < 0.01 ? 0 : l)
			if (next.some((l, i) => Math.abs(quiet(l) - quiet(levels[i] ?? 0)) > 0.01) || next.length !== levels.length)
				jb.setLevels(next.map(quiet))
			levels = next
		}
		draw()
		return () => cancelAnimationFrame(frame)
	})
	const jump = (e) => {
		const song = jb.nowPlaying()
		if (!song) return
		const box = canvas.getBoundingClientRect()
		const hit = hitRoll(canvas, song, jb.elapsed(), e.clientX - box.left, e.clientY - box.top)
		jb.seek(hit.t)
		if (hit.event) jb.showNote(hit.event, hit.section)
		else if (hit.section) jb.reveal(hit.section.ln)
	}
	return (
		<section class="screen">
			<canvas
				id="roll"
				ref={canvas}
				aria-label="The notes as they play"
				title="Jump here, and to the note in the score"
				onPointerDown={jump}
			/>
		</section>
	)
}
