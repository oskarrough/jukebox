// The black screen with the piano roll, redrawn every frame, the bars the
// score's caret is in lit. Which voices it finds sounding feeds the voices'
// activity edges. You draw on it: a click adds a note to the voice you're on
// (where it would go shows as an outline), a drag moves a note or, from its
// end, stretches it, a double-click deletes it, and a click on a drum lane
// switches that step. While you drag it shows the song as it will be, and
// you hear the note; letting go writes it into the score. A click on a note
// without dragging finds it in the score, and the tape holds still so a
// second click can delete it; the pattern names along the top jump there,
// and a click on the chords under them picks that bar for the chord pad,
// which sits below the tape when it's open.
import { Show, onSettled } from 'solid-js'
import { drawRoll, hitRoll } from '../roll.js'
import { compile } from '../score.js'
import { prefersFlats, transposeToken } from '../key.js'
import { addNote, blocked, moveNote, nameOf, noteAt, placeAt, removeNote, setHit, snap, stretchNote, timeAt } from './draw.js'
import { jb } from './state.js'
import { ChordPad } from './ChordPad.jsx'

const TIPS = {
	note: 'Find in the score; drag to move or stretch, double-click to delete',
	hit: 'Switch this step on or off',
	jump: 'Jump here, and to the pattern in the score',
	chord: 'Pick a chord for this bar on the pad',
	broken: 'Fix this bar in the score to draw here',
}

export function Roll() {
	let canvas
	// What a drag is doing, and the song as it will be: plain variables, read
	// by the frame as it draws, not signals.
	let drag = null
	let preview = null
	let ghost = null
	// The voice last touched on the roll, and how long the last note drawn was.
	let last = null
	let length = 0

	onSettled(() => {
		let frame = 0
		let levels = []
		const draw = () => {
			frame = requestAnimationFrame(draw)
			const song = jb.nowPlaying()
			if (!song) return canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
			const bar = jb.padOpen() ? jb.target() : null
			const sounding = drawRoll(canvas, preview ?? song, jb.elapsed(), jb.mutedSet(), jb.marks(), ghost, drag?.song, bar)
			const next = song.voices.map((_, i) => (jb.live() && sounding.has(i) ? 1 : (levels[i] ?? 0) * 0.85))
			const quiet = (l) => (l < 0.01 ? 0 : l)
			if (next.some((l, i) => Math.abs(quiet(l) - quiet(levels[i] ?? 0)) > 0.01) || next.length !== levels.length)
				jb.setLevels(next.map(quiet))
			levels = next
		}
		draw()
		return () => cancelAnimationFrame(frame)
	})

	// The song and its text, when what's written is what plays: only then can
	// a change on the roll find its place in the score.
	const current = () => {
		const song = jb.nowPlaying()
		return song && !jb.parsed().errors.length && song.voices.length ? { song, text: jb.text() } : null
	}
	const hitAt = (e, song, frame) => {
		const box = canvas.getBoundingClientRect()
		return hitRoll(canvas, song, jb.elapsed(), e.clientX - box.left, e.clientY - box.top, frame)
	}
	// The melodic voice a click adds to: the caret's, the last touched, or the first.
	const voiceFor = (song) => {
		const ok = (name) => song.voices.find((v) => v.name === name && !v.drum)
		return ok(jb.caret()?.voice) ?? ok(last) ?? song.voices.find((v) => !v.drum)
	}
	const sectionOf = (song, place) => song[place.tl].sections[place.i]
	const stepOf = (sec) => 60 / sec.tempo / sec.steps
	// Where an event on the roll is in the song, from the moment clicked.
	function placeOf(song, hit) {
		const e = hit.event
		const tl = song.intro.sections.includes(hit.section) ? 'intro' : 'loop'
		let off = 0
		if (tl === 'loop') {
			off = song.intro.dur + Math.floor((hit.t - song.intro.dur) / song.loop.dur) * song.loop.dur
			if (off + e.t > hit.t + 0.05) off -= song.loop.dur
		}
		return { tl, i: e.s, off, b: e.b, st: e.st }
	}
	// The pitch to write for `m` on screen, and back: the voice's and the
	// section's transposition between them.
	const shift = (song, place, v) => v.trans + sectionOf(song, place).trans

	// How many steps from `from` reach the step under `t`, that one too:
	// to the end of the bar past it, one before it.
	function reach(cur, from, t) {
		const to = placeAt(cur.text, cur.song, t)
		if (!to) return 1
		const sec = sectionOf(cur.song, from)
		const at = (p) => [p.tl === 'loop' ? 1 : 0, p.i, p.b]
		const later =
			at(to)
				.map((n, k) => Math.sign(n - at(from)[k]))
				.find((n) => n) ?? 0
		if (later) return later > 0 ? sec.beats * sec.steps - from.st : 1
		return Math.max(1, to.st - from.st + 1)
	}

	// A note about to be added at `hit` by voice `v`: the edit and its
	// outline. Drawn from `from`, it reaches as far as the pointer.
	function adding(cur, hit, v, from = null) {
		const place = from ?? placeAt(cur.text, cur.song, hit.t)
		if (!place || hit.m == null) return null
		const sec = sectionOf(cur.song, place)
		const n = sec.beats * sec.steps
		const len = from ? reach(cur, from, hit.t) : length || sec.steps
		const m = snap(cur.song, place, hit.m - shift(cur.song, place, v), jb.key())
		const out = addNote(cur.text, cur.song, place, v.name, m, Math.min(len, n - place.st), jb.key())
		if (!out) return { place, blocked: blocked(cur.text, cur.song, place, v.name) ?? 'broken' }
		const show = m + shift(cur.song, place, v)
		const i = cur.song.voices.indexOf(v)
		return { place, out, m, ghost: { t: timeAt(cur.text, cur.song, place), d: out.len * stepOf(sec), v: i, m: show } }
	}

	// Pointing: the cursor, the tooltip and the outline say what a click does.
	function hover(e) {
		if (drag) return
		const cur = current()
		ghost = null
		if (!cur) return say('pointer', 'Jump here, and to the note in the score')
		const hit = hitAt(e, cur.song)
		if (hit.bar) return say('pointer', TIPS.chord)
		if (hit.event) {
			const drum = cur.song.voices[hit.event.v].drum
			return say(drum ? 'pointer' : hit.end ? 'ew-resize' : 'grab', drum ? TIPS.hit : TIPS.note)
		}
		if (hit.section) return say('pointer', TIPS.jump)
		if (hit.lane != null) {
			const place = placeAt(cur.text, cur.song, hit.t)
			const v = cur.song.voices[hit.lane]
			const can = place && (setHit(cur.text, cur.song, place, v.name, true) ?? setHit(cur.text, cur.song, place, v.name, false))
			if (!can) return refuse(cur, place, v)
			ghost = { t: timeAt(cur.text, cur.song, place), d: stepOf(sectionOf(cur.song, place)), v: hit.lane }
			return say('pointer', TIPS.hit)
		}
		const v = voiceFor(cur.song)
		const add = v && adding(cur, hit, v)
		if (!add) return say('pointer', TIPS.jump)
		if (add.blocked) return refuse(cur, add.place, v)
		ghost = add.ghost
		say('crosshair', `Add a note to ${v.name}`)
	}
	function refuse(cur, place, v) {
		const why = place && blocked(cur.text, cur.song, place, v.name)
		say('not-allowed', why === 'muted' ? `Unmute ${v.name} in this pattern to draw here` : TIPS.broken)
	}
	function say(cursor, tip) {
		canvas.style.cursor = cursor
		if (canvas.title !== tip) canvas.title = tip
	}

	// The old click: jump to the moment, and to the note or pattern in the score.
	function jump(hit) {
		jb.seek(hit.t)
		if (hit.event) jb.showNote(hit.event, hit.section)
		else if (hit.section) jb.reveal(hit.section.ln)
	}

	function press(e) {
		const song = jb.nowPlaying()
		if (e.button !== 0 || !song) return
		const cur = current()
		const hit = hitAt(e, song)
		if (hit.bar) return jb.pickBar(hit.bar.section.name, hit.bar.b)
		if (!cur || (hit.section && !hit.event)) return jump(hit)
		const start = { ...cur, x: e.clientX, y: e.clientY, moved: false, next: null, key: null }
		if (hit.event) {
			const v = cur.song.voices[hit.event.v]
			const place = placeOf(cur.song, hit)
			if (v.drum) drag = { ...start, kind: 'hits', v }
			else {
				const note = noteAt(cur.text, cur.song, place, v.name)
				if (!note) return jump(hit)
				last = v.name
				const s = shift(cur.song, place, v)
				const at = timeAt(cur.text, cur.song, place)
				drag = {
					...start,
					kind: hit.end ? 'stretch' : 'move',
					v,
					from: place,
					note,
					hit,
					grab: hit.pitch - s,
					dt: hit.t - at,
					dm: hit.m - hit.pitch,
				}
			}
		} else if (hit.lane != null) drag = { ...start, kind: 'hits', v: cur.song.voices[hit.lane] }
		else {
			const v = voiceFor(cur.song)
			const add = v && adding(cur, hit, v)
			if (!add) return jump(hit)
			if (add.blocked) return
			last = v.name
			drag = { ...start, kind: 'add', v, from: add.place }
		}
		ghost = null
		canvas.setPointerCapture(e.pointerId)
		move(e)
	}

	// Works out what the drag has got to, shows it and plays it.
	function move(e) {
		if (!drag) return hover(e)
		const d = drag
		if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 3) d.moved = true
		const hit = hitAt(e, d.song, d.song)
		const key = jb.key()
		let next = null
		let token = null
		let id
		if (d.kind === 'add') {
			d.m = hit.m ?? d.m
			const add = adding(d, { ...hit, m: d.m }, d.v, d.from)
			if (!add?.out) return
			id = `${add.m}:${add.out.len}`
			next = add.out
			length = add.out.len
			token = nameOf(d.text, add.m + sectionOf(d.song, d.from).trans, key)
		} else if (d.kind === 'stretch') {
			const len = reach(d, { ...d.from, st: d.note.st }, hit.t - stepOf(sectionOf(d.song, d.from)) / 2)
			id = `${len}`
			next = stretchNote(d.text, d.song, d.from, d.v.name, len) ?? { text: d.text, unchanged: true }
			length = len
		} else if (d.kind === 'move') {
			if (!d.moved) return
			const to = placeAt(d.text, d.song, Math.max(0, hit.t - d.dt + stepOf(sectionOf(d.song, d.from)) / 2))
			if (!to) return
			const trans = sectionOf(d.song, to).trans
			const by = hit.m == null ? 0 : snap(d.song, to, hit.m - d.dm - d.v.trans - trans, key) - d.grab
			id = `${to.tl}${to.i}:${to.b}:${to.st}:${by}`
			const home = id === `${d.from.tl}${d.from.i}:${d.from.b}:${d.note.st}:0`
			next = home ? { text: d.text, unchanged: true } : moveNote(d.text, d.song, d.from, to, d.v.name, by, key)
			const chord = /[[+]/.test(d.note.head)
			token = chord ? transposeToken(d.note.head, by + trans, prefersFlats(key)) : nameOf(d.text, d.grab + by + trans, key)
		} else {
			// a drum lane: each step crossed switches the way the first did
			const cur = d.cur ?? d
			const place = placeAt(cur.text, cur.song, hit.t)
			if (!place) return
			id = `${place.tl}${place.i}:${place.b}:${place.st}`
			if ((d.seen ??= new Set()).has(id)) return
			d.seen.add(id)
			d.on ??= !!setHit(cur.text, cur.song, place, d.v.name, true)
			next = setHit(cur.text, cur.song, place, d.v.name, d.on)
			if (!next) return
			d.cur = { text: next.text, song: compile(next.text) }
			token = d.on ? 'x' : null
		}
		if (id === d.key || !next) return
		d.key = id
		d.next = next
		preview = next.unchanged ? null : (d.cur?.song ?? compile(next.text))
		if (preview?.errors.length) preview = null
		if (token) jb.audition(next.text, d.v.name, token)
	}

	function release(e) {
		const d = drag
		if (!d) return
		drag = null
		preview = null
		if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
		const click = !d.moved && (d.kind === 'move' || d.kind === 'stretch')
		if (click) jb.showNote(d.hit.event, d.hit.section)
		else if (d.next && !d.next.unchanged && d.next.text !== d.text) jb.draw(d.next.text, d.next.ln, d.next.col)
		hover(e)
	}

	// A double-click on a note deletes it.
	function remove(e) {
		const cur = current()
		if (!cur) return
		const hit = hitAt(e, cur.song)
		const v = hit.event && cur.song.voices[hit.event.v]
		if (!v || v.drum) return
		const out = removeNote(cur.text, cur.song, placeOf(cur.song, hit), v.name)
		if (out) jb.draw(out.text, out.ln, out.col)
	}

	return (
		<section class="screen">
			<canvas
				id="roll"
				ref={canvas}
				aria-label="The notes as they play"
				title={TIPS.jump}
				onPointerDown={press}
				onPointerMove={move}
				onPointerUp={release}
				onPointerCancel={() => {
					drag = preview = null
				}}
				onPointerLeave={() => {
					if (!drag) ghost = null
				}}
				onDblClick={remove}
			/>
			<Show when={jb.padOpen()}>
				<ChordPad />
			</Show>
		</section>
	)
}
