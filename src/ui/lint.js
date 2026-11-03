// The score's errors placed on the words they're about, each with a short
// note for the end of its line and, when the word looks like a slip for one
// the song could mean, the word it should be.
import { OPTIONS, PATTERN_OPTIONS, SETTINGS, parse } from '../score.js'
import { INSTRUMENTS } from './complete.js'
import { barAt } from './link.js'

const KEYWORDS = [...SETTINGS, 'voice', 'pattern', 'play', 'loop', 'mute']

// Which words a quoted slip could be for, by what its message says.
const MEANT = [
	[/^Unknown instrument/, () => INSTRUMENTS],
	[/^Unknown voice option/, () => OPTIONS],
	[/^Unknown pattern option/, () => PATTERN_OPTIONS],
	[/^Unknown line/, () => KEYWORDS],
	[/isn't a voice/, (song) => song.voices.map((v) => v.name)],
	[/^There's no pattern|which doesn't exist/, (song) => song.patternOrder],
]

// For each line with errors, by line number: [{ start, end, msg, note, fix }],
// start and end the columns to underline.
export function mistakes(text, errors) {
	const out = new Map()
	if (!errors.length) return out
	const lines = text.split('\n')
	const { song } = parse(text)
	for (const e of errors) {
		// A voice whose own line is wrong: that line says why.
		const echo = /^"(\w+)" isn't a voice/.exec(e.msg)
		if (echo && lines.some((l) => new RegExp(`^\\s*voice\\s+${echo[1]}\\s`, 'i').test(l))) continue
		const line = lines[e.line - 1] ?? ''
		const hash = line.match(/(^|\s)#/)
		const body = hash ? line.slice(0, hash.index + hash[1].length) : line
		const word = /"([^"]+)"/.exec(e.msg)?.[1]
		const bar = e.bar >= 0 && barAt(body, e.bar)
		let start = body.search(/\S/)
		let end = body.trimEnd().length
		if (bar) [start, end] = [bar.start + bar.text.search(/\S|$/), bar.start + bar.text.trimEnd().length]
		const at = word ? find(body, word, start, end) : -1
		if (at >= 0) [start, end] = [at, at + word.length]
		const meant = at >= 0 && MEANT.find(([re]) => re.test(e.msg))
		const mistake = {
			start: Math.max(0, start),
			end: Math.max(start + 1, end),
			msg: e.msg,
			// The line already says which voice and pattern.
			note: e.msg.replace(/ of "\w+" in pattern \w+/, ''),
			fix: meant ? closest(word, meant[1](song)) : null,
		}
		out.set(e.line, [...(out.get(e.line) ?? []), mistake])
	}
	return out
}

// Where `word` is written between `from` and `to` in `line`, as a word of its
// own if it can be; -1 if it isn't.
function find(line, word, from, to) {
	const span = line.slice(0, to)
	let loose = -1
	for (let i = span.indexOf(word, from); i >= 0; i = span.indexOf(word, i + 1)) {
		if (!/\w/.test(line[i - 1] ?? '') && !/\w/.test(line[i + word.length] ?? '')) return i
		if (loose < 0) loose = i
	}
	return loose
}

// The one word in `list` that `word` most likely meant to be: the only one it
// starts, or the only one a slip or two away; null if none or several.
export function closest(word, list) {
	const w = word.toLowerCase()
	const starts = list.filter((c) => c.toLowerCase().startsWith(w))
	if (w.length > 1 && starts.length === 1) return starts[0]
	const most = w.length > 4 ? 2 : w.length > 1 ? 1 : 0
	let best = null
	let tie = false
	let least = most + 1
	for (const c of list) {
		const d = distance(w, c.toLowerCase())
		if (d < least) [best, least, tie] = [c, d, false]
		else if (d === least) tie = true
	}
	return best && !tie && best !== word ? best : null
}

// Edits from a to b, a swap of two letters counting as one.
function distance(a, b) {
	const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
	for (let j = 1; j <= b.length; j++) d[0][j] = j
	for (let i = 1; i <= a.length; i++)
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1
			d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
		}
	return d[a.length][b.length]
}
