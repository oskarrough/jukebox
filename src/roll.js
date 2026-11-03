// A scrolling piano roll of the song, after the score view in Simon Willison's
// Scrimshaw Jukebox (https://tools.simonwillison.net/scrimshaw-jukebox, Apache
// License 2.0, see LICENSE here). Notes slide left past the yellow line as they
// play; each drum voice has a lane of step blocks along the bottom (the whole
// screen when there's no melody); muted voices fade out. A song with a chord
// row has its chords along the top, under the pattern names.

// Caran d'Ache pigments (see --c-* in App.css), spelled out because roll.js has no CSS.
const COLORS = [
	'lab(78.1128 32.6792 82.6376)',
	'lab(59.2648 -49.2568 3.41769)',
	'lab(63.0034 54.6564 26.0879)',
	'lab(58.0569 -10.4415 -45.1862)',
	'lab(67.5775 68.3862 -12.7348)',
	'lab(68.1739 14.7461 54.8651)',
	'lab(61.5296 -58.6363 39.9921)',
	'lab(63.0659 1.23221 -44.4879)',
	'lab(71.1376 -44.6808 10.8983)',
	'lab(70.855 -36.4744 -14.9111)',
]
// the drums' own warm to violet family, more saturated than the melody's
const DRUM_COLORS = [
	'lab(51.0916 62.7477 41.8985)',
	'lab(85.3906 10.2282 92.7778)',
	'lab(50.227 76.0093 -8.98042)',
	'lab(65.1177 53.6556 66.5807)',
	'lab(59.173 20.487 -39.7255)',
	'lab(44.9946 68.9684 -6.21602)',
	'lab(84.6744 6.12866 46.9872)',
	'lab(43.7626 33.3261 27.7532)',
]

// One colour per voice, each kind cycling through its own palette.
export function voiceColors(song) {
	let k = 0
	let d = 0
	return song.voices.map((v) => (v.drum ? DRUM_COLORS[d++ % DRUM_COLORS.length] : COLORS[k++ % COLORS.length]))
}

const ranges = new WeakMap()

// The pitch range of every note in the song, with a little room either side.
function range(song) {
	if (!ranges.has(song)) {
		let lo = 127
		let hi = 0
		for (const tl of [song.intro, song.loop])
			for (const e of tl.events) if (e.m) for (const m of e.m) [lo, hi] = [Math.min(lo, m), Math.max(hi, m)]
		// a melodic voice with nothing written yet still gets room for notes
		const melodic = lo <= hi || song.voices.some((v) => !v.drum)
		if (lo > hi) [lo, hi] = [48, 72]
		const drums = song.voices.flatMap((v, i) => (v.drum ? [i] : []))
		const chorded = [song.intro, song.loop].some((tl) => tl.sections.some((s) => s.chords?.length))
		ranges.set(song, { lo: Math.floor(lo) - 2, hi: Math.ceil(hi) + 2, melodic, drums, chorded, colors: voiceColors(song) })
	}
	return ranges.get(song)
}

// Where everything goes on a `W`×`H` roll of `song` at `at` seconds from its
// start (past its length means it has looped), its pitches and lanes those
// of `frame`, so a song being edited holds still.
function layout(song, at, W, H, frame = song) {
	const { lo, hi, melodic, drums, chorded, colors } = range(frame)
	const span = W < 500 ? 4.5 : 7 // seconds across
	const pre = span * 0.22 // of them already played
	const pps = W / span
	const x0 = W * 0.22
	// the notes below the pattern names, and the chords if there are any
	const head = chorded ? 36 : 6
	// a lane per drum voice: the whole screen below the pattern names without
	// melody, otherwise up to two fifths of it at the bottom
	const top = melodic ? head : chorded ? 36 : 22
	const laneH = !drums.length
		? 0
		: melodic
			? Math.max(5, Math.min(14, (H * 0.4) / drums.length))
			: Math.min(72, (H - top - 6) / drums.length)
	const drumTop = melodic ? H - 6 - drums.length * laneH : top
	const noteH = Math.max(3, (drumTop - head - 6 - (drums.length ? 4 : 0)) / (hi - lo + 1))
	// the intro once, then as many turns of the loop as are on screen
	const a = at - pre
	const z = at + span - pre
	const windows = []
	if (a < song.intro.dur) windows.push([song.intro, 0])
	if (song.loop.dur) {
		const k0 = Math.max(0, Math.floor((a - song.intro.dur) / song.loop.dur))
		const k1 = Math.floor((z - song.intro.dur) / song.loop.dur)
		for (let k = k0; k <= k1 && k < k0 + 4; k++) windows.push([song.loop, song.intro.dur + k * song.loop.dur])
	}
	return {
		lo,
		hi,
		melodic,
		drums,
		chorded,
		colors,
		head,
		pps,
		x0,
		a,
		z,
		windows,
		laneH,
		drumTop,
		noteH,
		xOf: (t) => x0 + (t - at) * pps,
		yOf: (m) => head + (hi - m) * noteH,
		tOf: (x) => at + (x - x0) / pps,
	}
}

// What's under `x`,`y` on the roll: the moment `t` from the song's start,
// the pitch there `m` (a midi number with a fraction) or the drum `lane` (a
// voice's index), and the note there, else the pattern name, if any:
// { event, section, pitch, end }, the note's `pitch` the one under `y` and
// `end` when `x` is at its end. On the chords, `bar`: { section, b }.
export function hitRoll(canvas, song, at, x, y, frame) {
	const L = layout(song, at, canvas.clientWidth, canvas.clientHeight, frame)
	const t = Math.max(0, L.tOf(x))
	const near = (t0, w) => x >= L.xOf(t0) - 3 && x <= L.xOf(t0) + w + 3
	const inLanes = L.drums.length && y >= L.drumTop - 2
	const place = {
		t,
		m: L.melodic && !inLanes ? L.hi + 0.5 - (y - L.head) / L.noteH : null,
		lane: inLanes ? (L.drums[Math.min(L.drums.length - 1, Math.floor((y - L.drumTop) / L.laneH))] ?? null) : null,
	}
	// a thin note is still a finger wide to grab
	const slop = Math.max(2, (8 - L.noteH) / 2)
	let label = null
	if (L.chorded && y >= 18 && y < 34)
		for (const [tl, off] of L.windows) {
			const s = tl.sections.find((s) => t >= off + s.start && t < off + s.start + s.dur)
			if (s) return { ...place, bar: { section: s, b: Math.min(s.bars - 1, Math.floor((t - off - s.start) / s.barDur)) } }
		}
	for (const [tl, off] of L.windows) {
		const s = tl.sections.find((s) => t >= off + s.start && t < off + s.start + s.dur)
		if (s && y < 20 && near(off + s.start, 40)) label ??= s
		for (const e of tl.events) {
			const v = song.voices[e.v]
			const top = v.drum ? L.drumTop + L.drums.indexOf(e.v) * L.laneH : null
			const pitch = v.drum ? null : e.m.find((m) => y >= L.yOf(m) - slop && y <= L.yOf(m) + L.noteH + slop)
			const hit = v.drum ? y >= top && y <= top + L.laneH : pitch != null
			const w = Math.max(2, e.d * L.pps - 1)
			if (hit && near(off + e.t, w))
				return { ...place, event: e, section: tl.sections[e.s], pitch, end: !v.drum && w > 14 && x > L.xOf(off + e.t) + w - 6 }
		}
	}
	return label ? { ...place, section: label } : place
}

// Draws `song` at `at` seconds from its start onto `canvas`, with the voices
// named in `muted` faded and the bars in `marks` (from marksFor) lit, and the
// outline of a note about to be written, `ghost` ({ t, d, v, m }; no `m` on a
// drum), if any. With `frame`, its pitches and lanes. With `next`
// ({ pattern, bar }), that bar of the chords is outlined: where the next
// chord goes. Returns which voices are sounding at `at`, by index.
export function drawRoll(canvas, song, at, muted, marks, ghost, frame, next) {
	const dpr = window.devicePixelRatio || 1
	const W = canvas.clientWidth
	const H = canvas.clientHeight
	if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
		canvas.width = Math.round(W * dpr)
		canvas.height = Math.round(H * dpr)
	}
	const g = canvas.getContext('2d')
	g.setTransform(dpr, 0, 0, dpr, 0, 0)
	g.fillStyle = '#0b0b0b'
	g.fillRect(0, 0, W, H)
	const { lo, hi, melodic, drums, chorded, colors, pps, x0, a, z, windows, laneH, drumTop, noteH, yOf } = layout(song, at, W, H, frame)

	// a faint line at every C
	g.fillStyle = '#262626'
	if (melodic) for (let m = Math.ceil(lo / 12) * 12; m <= hi; m += 12) g.fillRect(0, Math.round(yOf(m)), W, 1)
	// a lane for every drum voice
	g.fillStyle = '#141414'
	for (let i = 0; i < drums.length; i++) g.fillRect(0, Math.round(drumTop + i * laneH), W, Math.round(laneH) - 1)

	g.font = '11px ui-monospace, monospace'
	const sounding = new Set()
	for (const [tl, off] of windows) {
		for (const s of tl.sections)
			for (let b = 0; b < s.bars; b++) {
				const bt = off + s.start + b * s.barDur
				if (bt < a - 1 || bt > z) continue
				const x = Math.round(x0 + (bt - at) * pps)
				// the bar the caret is in
				if (marks && (marks.whole.has(s.name) || marks.bars.has(`${s.name}:${b}`))) {
					g.fillStyle = '#ffffff14'
					g.fillRect(x, 0, Math.round(s.barDur * pps), H)
				}
				g.fillStyle = b === 0 ? '#555' : '#2c2c2c'
				g.fillRect(x, 0, 1, H)
				if (b === 0) {
					g.fillStyle = '#999'
					g.fillText(s.name + (s.trans ? (s.trans > 0 ? '+' : '') + s.trans : ''), x + 4, 14)
				}
				if (chorded && next?.pattern === s.name && next.bar === b) {
					g.strokeStyle = '#ffd96b99'
					g.setLineDash([3, 3])
					g.strokeRect(x + 1.5, 19.5, Math.round(s.barDur * pps) - 3, 14)
					g.setLineDash([])
				}
			}
		// the chords, each from where it starts, the one sounding bright
		if (chorded)
			for (const s of tl.sections) {
				const per = s.barDur / (s.beats * s.steps)
				for (const c of s.chords ?? []) {
					const t = off + s.start + c.step * per
					const w = c.len * per * pps
					if (t > z || t + c.len * per < a) continue
					const x = Math.round(x0 + (t - at) * pps)
					const on = at >= t && at < t + c.len * per
					g.fillStyle = on ? '#ffffff30' : '#ffffff12'
					g.fillRect(x + 1, 20, Math.max(1, w - 2), 13)
					g.save()
					g.beginPath()
					g.rect(x + 1, 18, Math.max(1, w - 4), 16)
					g.clip()
					g.fillStyle = on ? '#fff' : '#ccc'
					g.fillText(c.sym, x + 5, 30)
					g.restore()
				}
			}
		for (const e of tl.events) {
			const t = off + e.t
			if (t > z || t + (e.d || 0.05) < a) continue
			const v = song.voices[e.v]
			const dim = muted.has(v.name)
			const x = x0 + (t - at) * pps
			const on = at >= t && at < t + (v.drum ? Math.max(e.d, 0.12) : e.d || 0.08)
			if (on && !dim) sounding.add(e.v)
			g.fillStyle = colors[e.v]
			if (v.drum) {
				// a block per hit like the step pads: a ghost note is faint, an accent has an edge
				const pad = laneH > 10 ? 2 : 1
				const bx = Math.round(x)
				const by = Math.round(drumTop + drums.indexOf(e.v) * laneH) + pad
				const bw = Math.max(2, Math.round(e.d * pps - 1))
				const bh = Math.max(1, Math.round(laneH) - 1 - 2 * pad)
				g.globalAlpha = (dim ? 0.2 : on ? 1 : t > at ? 0.85 : 0.4) * (e.vel < 0.6 ? 0.5 : 1)
				g.fillRect(bx, by, bw, bh)
				if (e.vel >= 1 && bw > 6 && bh > 6) {
					g.strokeStyle = '#0008'
					g.lineWidth = 2
					g.strokeRect(bx + 1, by + 1, bw - 2, bh - 2)
				}
				continue
			}
			const w = Math.round(Math.max(2, e.d * pps - 1))
			const h = Math.max(2, Math.round(noteH) - (noteH > 4 ? 1 : 0))
			g.globalAlpha = dim ? 0.15 : on ? 1 : t > at ? 0.78 : 0.38
			for (const m of e.m) g.fillRect(Math.round(x), Math.round(yOf(m)), w, h)
			if (on && !dim) {
				g.fillStyle = '#fff'
				g.globalAlpha = 0.55
				for (const m of e.m) g.fillRect(Math.round(x), Math.round(yOf(m)), 2, h)
			}
		}
	}
	if (ghost) {
		const lane = drums.indexOf(ghost.v)
		const x = Math.round(x0 + (ghost.t - at) * pps) + 0.5
		const y = ghost.m == null ? Math.round(drumTop + lane * laneH) + 1.5 : Math.round(yOf(ghost.m)) + 0.5
		const h = ghost.m == null ? Math.round(laneH) - 4 : Math.max(2, Math.round(noteH) - 1)
		g.globalAlpha = 0.9
		g.strokeStyle = colors[ghost.v]
		g.lineWidth = 1
		g.strokeRect(x, y, Math.max(2, Math.round(ghost.d * pps) - 2), h)
	}
	g.globalAlpha = 1
	g.fillStyle = '#ffd96b'
	g.fillRect(Math.round(x0), 0, 2, H)
	return sounding
}
