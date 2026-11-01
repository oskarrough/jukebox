// What ties the score to the roll: where the caret is in the song's music,
// which bars on the roll that is, and where in the text a note on the roll
// was written.

const MUSIC = /^\s*([A-Za-z_]\w*)(?:@\d+)?\s*\|/

// Where `pos` in `text` is: its line `ln` (from 1), the pattern it's in, and
// on a music line its voice and bar `k` on that line (-1 left of the first |).
// On a play or loop line, the pattern is the name under the caret.
export function caretAt(text, pos) {
	const before = text.slice(0, pos)
	const ln = before.split('\n').length
	const lines = text.split('\n')
	const line = lines[ln - 1]
	const col = pos - before.lastIndexOf('\n') - 1
	const music = MUSIC.exec(line)
	if (/^\s*(play|loop)\b/i.test(line)) {
		const word = /\S*$/.exec(line.slice(0, col))[0] + /^\S*/.exec(line.slice(col))[0]
		return { ln, k: -1, voice: null, pattern: word.replace(/[*+-]\d+$/, '') || null }
	}
	let pattern = null
	for (let i = ln - 1; i >= 0 && !pattern; i--) pattern = /^\s*pattern\s+(\S+)/i.exec(lines[i])?.[1] ?? null
	if (!music) return { ln, k: -1, voice: null, pattern }
	const k = line.slice(0, col).split('|').length - 2
	return { ln, k, voice: music[1], pattern }
}

// The bars on the roll the caret is in: each `name:bar` of a pattern, or
// whole patterns, and the first moment either starts.
export function marksFor(song, at) {
	const bars = new Set()
	const whole = new Set()
	let first = null
	if (!song || !at) return { bars, whole, first }
	for (const [tl, off] of [
		[song.intro, 0],
		[song.loop, song.intro.dur],
	])
		for (const s of tl.sections) {
			const written = at.voice && at.k >= 0 ? (s.where?.[at.voice] ?? []) : []
			written.forEach((w, b) => {
				if (w.ln !== at.ln || w.k !== at.k) return
				bars.add(`${s.name}:${b}`)
				first ??= off + s.start + b * s.barDur
			})
			if (!written.length && s.name === at.pattern) {
				whole.add(s.name)
				first ??= off + s.start
			}
		}
	return { bars, whole, first }
}

// The column in `line` where the note at `step` of bar `k` is written: drum
// lanes take a character a step, a note its dashes, a rest its dots.
export function columnOf(line, k, step, drum) {
	let start = -1
	for (let bar = -1, i = 0; i < line.length && bar < k; i++) if (line[i] === '|' && ++bar === k) start = i + 1
	if (start < 0) return 0
	const end = line.indexOf('|', start)
	const bar = line.slice(start, end < 0 ? line.length : end)
	let at = 0
	for (const m of bar.matchAll(drum ? /\S/g : /\S+/g)) {
		const t = m[0]
		const len = drum ? 1 : /^[.-]+$/.test(t) ? t.length : 1 + /-*$/.exec(t.replace(/[!?]+$/, ''))[0].length
		if (step < at + len) return start + m.index + (drum || !/^[.-]+$/.test(t) ? 0 : step - at)
		at += len
	}
	return start + bar.search(/\S|$/)
}
