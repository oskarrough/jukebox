// Writing what the piano plays into the score. While the song plays, a note
// lands on the step nearest when you pressed it, in the bar of the pattern
// playing then, and lasts the steps you held it; it replaces what was in
// those steps, so a take over a line rewrites it rather than piling up. While
// it's stopped, a note goes in at the caret and lasts to the next beat.
import { compile } from '../score.js'
import { barAt, caretAt, columnOf } from './link.js'
import { stepsOf } from './ruler.js'

const NOTE = '[A-Ga-g](?:##|bb|#|b|q)?[0-8]'
const PLAY = new RegExp(`^(~?)(\\[[^\\]]+\\]|${NOTE}(?:\\+${NOTE})*)([!?]*)(-*)([!?]*)$`)

// A bar's text as its steps: a note where one starts, '-' where it holds,
// '.' a rest. `before` is the bar before's steps, for a `%`.
export function cellsOf(bar, size, before) {
	const t = bar.trim()
	if (t === '%') return before ? [...before] : Array(size).fill('.')
	if (t === '=') return Array(size).fill('-')
	const out = []
	if (t !== '_')
		for (const tok of t.split(/\s+/).filter(Boolean)) {
			const m = PLAY.exec(tok)
			if (/^-+$/.test(tok)) out.push(...tok)
			else if (/^\.+-*$/.test(tok)) out.push(...'.'.repeat(tok.length))
			else if (m) out.push(m[1] + m[2] + m[3] + m[5], ...'-'.repeat(m[4].length))
			else out.push(tok)
		}
	while (out.length < size) out.push('.')
	return out
}

// Steps back as a bar's text: a note and its dashes, rests a beat at a time.
export function barText(cells, beat) {
	const words = []
	for (let i = 0; i < cells.length;) {
		const c = cells[i]
		let j = i + 1
		if (c === '.') while (j < cells.length && cells[j] === '.' && j % beat) j++
		else while (j < cells.length && cells[j] === '-') j++
		words.push(c === '.' ? '.'.repeat(j - i) : c + '-'.repeat(j - i - 1))
		i = j
	}
	return ` ${words.join(' ')} `
}

// `note` over `len` steps from step `at`: what was there goes, and so does
// the rest of a note it cut into. With `chord`, it joins a note starting there.
export function place(cells, at, len, note, chord) {
	const out = [...cells]
	const was = out[at] ?? ''
	if (chord && /^~?[A-G]/.test(was) && !was.includes('[')) {
		let held = 1
		while (out[at + held] === '-') held++
		len = Math.max(len, held)
		const m = /^(~?)(.*?)([!?]*)$/.exec(was)
		if (!m[2].split('+').includes(note)) note = `${m[1]}${m[2]}+${note}${m[3]}`
		else note = was
	}
	out[at] = note
	let i = at + 1
	for (; i < at + len && i < out.length; i++) out[i] = '-'
	for (; out[i] === '-'; i++) out[i] = '.'
	return out
}

// Where song time `t` (seconds, round the loop as often as you like) is,
// to the nearest step: its section, the step in it, and how long a step is.
export function moment(song, t) {
	const { intro, loop } = song
	let at = Math.max(0, t)
	let tl = intro
	if (at >= intro.dur && loop.dur) {
		tl = loop
		at = (at - intro.dur) % loop.dur
	}
	const all = tl.sections
	let i = all.findIndex((s) => at < s.start + s.dur)
	if (i < 0) i = all.length - 1
	let s = all[i]
	if (!s) return null
	const stepDur = 60 / s.tempo / s.steps
	let step = Math.round((at - s.start) / stepDur)
	if (step >= s.bars * s.beats * s.steps) {
		const next = all[i + 1] ?? (loop.dur ? loop.sections[0] : null)
		if (next) [s, step] = [next, 0]
		else step--
	}
	return { s, step, stepDur: 60 / s.tempo / s.steps }
}

// The beats and steps of a bar of `pattern`.
export function sizeOf(song, pattern) {
	const s = [...song.intro.sections, ...song.loop.sections].find((s) => s.name === pattern)
	return s ? { beats: s.beats, steps: s.steps } : { beats: song.beats, steps: song.steps }
}

// Writes `note` on `voice`, pressed at song time `from` and let go at `to`,
// into the bar of `song` playing then: { text, added } with `added` the line
// a new voice line went in at, or null when there's nowhere to write it.
export function record(text, song, { voice, from, to, note, chord }) {
	const m = moment(song, from)
	if (!m) return null
	const { s, step } = m
	const size = s.beats * s.steps
	if (!song.voices.some((v) => v.name === voice && !v.drum)) return null
	const lines = text.split('\n')
	let added = null
	let where = s.where?.[voice]?.map((w) => ({ ...w }))
	// No line for the voice in this pattern yet: one of rests, lined up with the others.
	if (!where?.length) {
		let at = s.ln
		let width = 0
		for (let i = s.ln; i < lines.length && !/^\s*(pattern|play|loop)\b/i.test(lines[i]); i++) {
			if (lines[i].trim()) at = i + 1
			if (!width && /^\s*\w+(@\d+)?\s*\|/.test(lines[i])) width = lines[i].indexOf('|')
		}
		const rests = barText(Array(size).fill('.'), s.steps)
		lines.splice(at, 0, `${voice.padEnd(width - 1)} |${Array(s.bars).fill(rests).join('|')}|`)
		added = at + 1
		where = Array.from({ length: s.bars }, (_, k) => ({ ln: added, k }))
	}
	// A line shorter than its pattern grows bars of rests to reach the note.
	const bar = Math.floor(step / size)
	while (where.length <= bar) {
		const last = where.at(-1)
		if (last.k < 0) return null
		let end = s.ln
		while (end < lines.length && !/^\s*(pattern|play|loop)\b/i.test(lines[end])) end++
		if (last.ln <= s.ln || last.ln > end) {
			lines.splice(end, 0, `${voice}@${where.length + 1} |${barText(Array(size).fill('.'), s.steps)}|`)
			for (const source of where) if (source.ln > end) source.ln++
			where.push({ ln: end + 1, k: 0 })
			added ??= end + 1
			continue
		}
		const line = lines[last.ln - 1].trimEnd()
		lines[last.ln - 1] = `${line}${line.endsWith('|') ? '' : ' |'}${barText(Array(size).fill('.'), s.steps)}|`
		where.push({ ln: last.ln, k: last.k + 1 })
	}
	// Resolve repeated bars through the section's source map, not just the
	// preceding bar on this line (which may itself be a patch or a repeat).
	const read = (b) => {
		const w = where[b]
		const found = w && w.k >= 0 && barAt(lines[w.ln - 1], w.k)
		return found ? cellsOf(found.text, size, found.text.trim() === '%' && b > 0 ? read(b - 1) : null) : null
	}
	// Rewrites inherited bars as local patches; the source pattern stays put.
	const edit = (b, fn) => {
		const w = where[b]
		const line = w && w.k >= 0 ? lines[w.ln - 1] : null
		const found = line != null && barAt(line, w.k)
		if (!found) return false
		const cells = read(b)
		const next = fn(cells)
		if (next.join() === cells.join()) return true
		let end = s.ln
		while (end < lines.length && !/^\s*(pattern|play|loop)\b/i.test(lines[end])) end++
		if (w.ln <= s.ln || w.ln > end) {
			lines.splice(end, 0, `${voice}@${b + 1} |${barText(next, s.steps)}|`)
			for (const source of where) if (source.ln > end) source.ln++
			where[b] = { ln: end + 1, k: 0 }
			added ??= end + 1
		} else {
			const close = line.indexOf('|', found.start) < 0 ? '|' : ''
			lines[w.ln - 1] = line.slice(0, found.start) + barText(next, s.steps) + close + line.slice(found.end)
		}
		return true
	}
	let left = Math.min(Math.max(1, Math.round((to - from) / m.stepDur)), s.bars * size - step)
	let at = step % size
	for (let b = bar; b < s.bars; b++, at = 0) {
		const n = Math.min(left, size - at)
		const first = b === bar
		if (!edit(b, (cells) => place(cells, at, n, first ? note : '-', first && chord)) && first) return null
		left -= n
		// Ending on the bar line, a note mustn't run on into what held there.
		if (left <= 0) {
			if (at + n === size) edit(b + 1, (cells) => (cells[0] === '-' ? place(cells, 0, 1, '.') : cells))
			break
		}
	}
	const w = where[bar]
	return { text: lines.join('\n'), added, ln: w.ln, col: columnOf(lines[w.ln - 1], w.k, step % size, false) }
}

// Step entry uses the chosen voice, never whichever line the caret left
// behind. A full pattern wraps instead of quietly growing another bar.
export function recordStep(text, { voice, pattern, step = 0, note }) {
	const song = compile(text, pattern)
	if (song.errors.length) return null
	const s = song.loop.sections[0]
	if (!s) return null
	const total = s.bars * s.beats * s.steps
	step = ((step % total) + total) % total
	const len = s.steps - (step % s.steps)
	const dur = 60 / s.tempo / s.steps
	const out = record(text, song, { voice, from: step * dur, to: (step + len) * dur, note })
	return out && { ...out, step: (step + len) % total }
}

// Writes `note` at the caret `pos` on a voice's line, stopped: it lasts to
// the next beat and never overfills its bar; the caret moves on past it, into
// the next bar once this one's full. { text, caret }, or null off a bar.
export function stepNote(text, pos, note, { beats, steps }) {
	const at = caretAt(text, pos)
	if (!at.voice) return null
	const size = beats * steps
	const lineStart = text.lastIndexOf('\n', pos - 1) + 1
	let line = text.slice(lineStart).split('\n')[0]
	let k = Math.max(0, at.k)
	let found = barAt(line, k)
	if (!found) return null
	const col = at.k < 0 ? 0 : pos - lineStart - found.start
	let i = (stepsOf(found.text, false) ?? []).filter((m) => m.start < col).length
	if (i >= size) {
		found = barAt(line, ++k)
		if (!found) {
			line = `${line.trimEnd()}${line.trimEnd().endsWith('|') ? '' : ' |'} `
			found = barAt(line, k)
		}
		i = 0
	}
	const prev = k > 0 ? barAt(line, k - 1) : null
	const cells = place(cellsOf(found.text, size, prev && cellsOf(prev.text, size)), i, steps - (i % steps), note)
	const written = barText(cells, steps)
	const close = line.indexOf('|', found.start) < 0 ? '|' : ''
	line = line.slice(0, found.start) + written + close + line.slice(found.end)
	// The caret: on the step after the note, else at the start of the next bar.
	const end = i + steps - (i % steps)
	let caret
	if (end < size) caret = found.start + stepsOf(written, false)[end].start
	else {
		const next = barAt(line, k + 1)
		if (!next) line = `${line.trimEnd()} `
		caret = next ? next.start + Math.max(0, next.text.search(/\S/)) : line.length
	}
	const lineEnd = text.indexOf('\n', pos)
	const after = lineEnd < 0 ? '' : text.slice(lineEnd)
	return { text: text.slice(0, lineStart) + line + after, caret: lineStart + caret }
}
