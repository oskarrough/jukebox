// The beat ruler: while the caret is in a bar, where each beat starts and
// whether the bar is full, as marks on the painted line. Works from the text
// in the box, which is ahead of the compiled song while you type.
import { DRUMS } from '../score.js'
import { caretAt } from './link.js'

const NOTE = '[A-Ga-g](?:##|bb|#|b|q)?[0-8]'
const REST = /^(\.+)(-*)$/
const HOLD = /^-+$/
const PLAY = new RegExp(`^(~?)(\\[[^\\]]+\\]|${NOTE}(?:\\+${NOTE})*)([!?]*)(-*)([!?]*)$`)

// The steps and beats a pattern's bar has: its own settings, else those of
// the pattern it builds on, else the song's.
function size(lines, pattern) {
	const song = {}
	const patterns = {}
	let cur = song
	for (const raw of lines) {
		const words = raw
			.replace(/(^|\s)#.*$/, '')
			.trim()
			.split(/\s+/)
		const word = words[0].toLowerCase()
		if (word === 'pattern' && words[1]) {
			cur = patterns[words[1]] = {}
			words.forEach((w, i) => {
				if (w.toLowerCase() === 'from') cur.from = words[i + 1]
				const kv = /^(beats|steps)=(.+)$/i.exec(w)
				if (kv) cur[kv[1].toLowerCase()] = Number(kv[2])
			})
		} else if (word === 'beats' || word === 'steps') cur[word] = Number(words[1])
	}
	const get = (key, name, seen = []) => {
		const p = patterns[name]
		if (!p || seen.includes(name)) return null
		return p[key] || get(key, p.from, [...seen, name])
	}
	const [beats, steps] = [
		['beats', 16],
		['steps', 12],
	].map(([key, max]) => Math.min(max, Math.round(get(key, pattern) || song[key] || 4)))
	return { beats, steps }
}

// Where each step of a bar's text is written: [{ start, end }] in columns of
// the bar, or null for a bar that repeats, holds or is silent.
export function stepsOf(bar, drum) {
	const out = []
	const step = (start, end) => out.push({ start, end })
	if (/^\s*[%_=]\s*$/.test(bar)) return null
	for (const m of bar.matchAll(/\S+/g)) {
		const [tok, at] = [m[0], m.index]
		if (drum) {
			for (let i = 0; i < tok.length; i++) step(at + i, at + i + 1)
			continue
		}
		let p
		if (HOLD.test(tok) || REST.test(tok)) for (let i = 0; i < tok.length; i++) step(at + i, at + i + 1)
		else if ((p = PLAY.exec(tok))) {
			const head = p[1].length + p[2].length + p[3].length
			step(at, at + head)
			for (let i = 0; i < p[4].length; i++) step(at + head + i, at + head + i + 1)
		}
	}
	return out
}

// The ruler for the bar at `pos` in `text`: { ln, marks }, the marks as
// { start, end, cls } in columns of its line. A tick on the step that starts
// each beat, `long` on the steps past the end of the bar and on its closing |,
// `short` on that | when the bar ends early. Null when the caret isn't in a bar.
export function ruler(text, pos) {
	const at = caretAt(text, pos)
	if (at.k < 0) return null
	const lines = text.split('\n')
	const line = lines[at.ln - 1]
	const hash = line.match(/(^|\s)#/)
	const body = hash ? line.slice(0, hash.index + hash[1].length) : line
	if (pos - text.lastIndexOf('\n', pos - 1) - 1 > body.length) return null
	// This bar: from the | before it to the next one, or the end of the line.
	const bars = [...body.matchAll(/\|/g)].map((m) => m.index)
	const start = bars[at.k] + 1
	const close = bars[at.k + 1] ?? -1
	const bar = body.slice(start, close < 0 ? body.length : close)
	const drum = lines.some((l) => {
		const v = /^\s*voice\s+(\S+)\s+(\S+)/i.exec(l)
		return v && v[1] === at.voice && DRUMS.includes(v[2].toLowerCase())
	})
	const found = stepsOf(bar, drum)
	if (!found?.length) return null
	const { beats, steps } = size(lines, at.pattern)
	const need = beats * steps
	const marks = []
	found.forEach((s, i) => {
		if (i % steps === 0 && i < need) marks.push({ start: start + s.start, end: start + s.end, cls: 'tick' })
		if (i >= need) marks.push({ start: start + s.start, end: start + s.end, cls: 'long' })
	})
	if (close >= 0 && found.length !== need) marks.push({ start: close, end: close + 1, cls: found.length > need ? 'long' : 'short' })
	return { ln: at.ln, marks }
}
